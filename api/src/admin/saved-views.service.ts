import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module';
import { adminSavedViews } from '../db/schema';
import type { AdminSession } from '../auth/session.service';

export const SAVED_VIEW_NAME_MAX_LENGTH = 40;
export const SAVED_VIEW_QUERY_MAX_LENGTH = 500;
// A tab strip stops being scannable long before this; the cap exists so one
// admin cannot turn their own queue header into an unbounded list.
export const SAVED_VIEWS_MAX_PER_ADMIN = 12;

// The admin surfaces that own a view strip. Kept in sync with the CHECK
// constraint in 0029_saved_views_surface.sql — a value that passes here but
// fails there would surface as a 500 on save rather than a 400.
export const SAVED_VIEW_SURFACES = ['tickets', 'flagged'] as const;
export type SavedViewSurface = (typeof SAVED_VIEW_SURFACES)[number];
export const DEFAULT_SAVED_VIEW_SURFACE: SavedViewSurface = 'tickets';

// Callers send the surface as a raw query/body value. Anything unrecognized
// falls back to 'tickets' rather than throwing: the Ticket Queue shipped
// before this column existed and still calls these endpoints without a
// surface at all, and that request must keep meaning what it always did.
export function parseSavedViewSurface(input: unknown): SavedViewSurface {
  return SAVED_VIEW_SURFACES.includes(input as SavedViewSurface)
    ? (input as SavedViewSurface)
    : DEFAULT_SAVED_VIEW_SURFACE;
}

export interface SavedViewRow {
  id: number;
  name: string;
  query: string;
  position: number;
}

// Saved views are strictly personal. Every method below scopes on
// adminId = session.adminId, which is why there is no resolveOfficeScope call
// here: office scoping governs which TICKETS you can see, and that is still
// enforced by TicketsService.parseTicketQuery when the stored query string is
// replayed. A saved view is a bookmark, never a grant — a preset containing
// `office=MDRRMO` saved by a system admin and somehow replayed by an MEO
// officer would still be clamped back to MEO on read.
//
// The same holds for the 'flagged' surface, where the replaying parser is
// ModerationService.parseModerationQuery instead. Adding a surface changed
// which parser re-reads the string, not whether one does.
@Injectable()
export class SavedViewsService {
  constructor(@Inject(DB) private readonly db: PostgresJsDatabase) {}

  async list(
    admin: AdminSession,
    surface: SavedViewSurface = DEFAULT_SAVED_VIEW_SURFACE,
  ): Promise<SavedViewRow[]> {
    return this.db
      .select({
        id: adminSavedViews.id,
        name: adminSavedViews.name,
        query: adminSavedViews.query,
        position: adminSavedViews.position,
      })
      .from(adminSavedViews)
      .where(
        and(
          eq(adminSavedViews.adminId, admin.adminId),
          eq(adminSavedViews.surface, surface),
        ),
      )
      .orderBy(asc(adminSavedViews.position), asc(adminSavedViews.id));
  }

  // Re-saving an existing name overwrites its query rather than adding a
  // second tab with the same label — "Save this view" is how an admin both
  // creates and updates a preset, and two identically-named tabs would be
  // indistinguishable in the strip.
  async create(
    admin: AdminSession,
    nameInput: unknown,
    queryInput: unknown,
    surface: SavedViewSurface = DEFAULT_SAVED_VIEW_SURFACE,
  ): Promise<SavedViewRow> {
    const name = typeof nameInput === 'string' ? nameInput.trim() : '';
    if (!name) throw new BadRequestException('name is required.');
    if (name.length > SAVED_VIEW_NAME_MAX_LENGTH) {
      throw new BadRequestException(
        `name must be ${SAVED_VIEW_NAME_MAX_LENGTH} characters or fewer.`,
      );
    }
    const query = typeof queryInput === 'string' ? queryInput.trim() : '';
    if (query.length > SAVED_VIEW_QUERY_MAX_LENGTH) {
      throw new BadRequestException(
        `query must be ${SAVED_VIEW_QUERY_MAX_LENGTH} characters or fewer.`,
      );
    }

    // Per surface, not per admin: list() is already scoped, so the 12-view
    // cap and the same-name overwrite below both apply within one strip.
    // A "Needs review" preset on Flagged Reports and one on the Ticket Queue
    // are different bookmarks and must not collide.
    const existing = await this.list(admin, surface);
    const match = existing.find((view) => view.name === name);
    if (match) {
      const [updated] = await this.db
        .update(adminSavedViews)
        .set({ query })
        .where(eq(adminSavedViews.id, match.id))
        .returning({
          id: adminSavedViews.id,
          name: adminSavedViews.name,
          query: adminSavedViews.query,
          position: adminSavedViews.position,
        });
      return updated;
    }

    if (existing.length >= SAVED_VIEWS_MAX_PER_ADMIN) {
      throw new BadRequestException(
        `You can save at most ${SAVED_VIEWS_MAX_PER_ADMIN} views. Delete one first.`,
      );
    }

    const [created] = await this.db
      .insert(adminSavedViews)
      .values({
        adminId: admin.adminId,
        name,
        query,
        surface,
        position: existing.length,
      })
      .returning({
        id: adminSavedViews.id,
        name: adminSavedViews.name,
        query: adminSavedViews.query,
        position: adminSavedViews.position,
      });
    return created;
  }

  // The adminId predicate is the authorization check, not a filter: deleting
  // by id alone would let any admin delete any other admin's preset.
  async remove(admin: AdminSession, id: number): Promise<{ ok: true }> {
    const deleted = await this.db
      .delete(adminSavedViews)
      .where(
        and(
          eq(adminSavedViews.id, id),
          eq(adminSavedViews.adminId, admin.adminId),
        ),
      )
      .returning({ id: adminSavedViews.id });
    if (deleted.length === 0) throw new NotFoundException('Saved view not found.');
    return { ok: true };
  }
}
