import {
  BadRequestException,
  Body,
  Controller,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OperationalPriorityService } from '../domain/operational-priority.service';
import { HazardInformationService } from '../domain/hazard-information.service';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { OperationalStaffGuard } from '../common/guards/operational-staff.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import type { AdminSession } from '../auth/session.service';
import { BULK_MAX_TICKETS, TicketsService } from './tickets.service';
import {
  OperationalAssessmentService,
  type OperationalAssessmentInput,
} from './operational-assessment.service';
import { RelatedTicketsService } from './related-tickets.service';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = /^image\/(jpeg|png|webp)$/;

// Shared by every bulk route. Rejects the request outright (rather than
// skipping bad entries) because a malformed id list means the client is
// broken, not that one ticket is ineligible — the { ok, skipped } contract
// is for per-ticket outcomes only.
function parseTicketIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('ticketIds must be a non-empty array');
  }
  if (value.length > BULK_MAX_TICKETS) {
    throw new BadRequestException(
      `ticketIds must contain at most ${BULK_MAX_TICKETS} ids`,
    );
  }
  const ids = value.map((v) => Number(v));
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new BadRequestException('ticketIds must be positive integers');
  }
  // De-duplicate: a repeated id would otherwise be advanced twice and write
  // two audit rows for one intent.
  return [...new Set(ids)];
}

@UseGuards(AdminSessionGuard, OperationalStaffGuard)
@Controller('admin/tickets')
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly operationalPriority: OperationalPriorityService,
    private readonly assessments: OperationalAssessmentService,
    private readonly related: RelatedTicketsService,
    private readonly hazardInformation: HazardInformationService,
  ) {}

  @Get()
  async list(
    @Query() query: Record<string, string | undefined>,
    @CurrentAdmin() admin: AdminSession,
  ) {
    await this.operationalPriority.recalculateActiveTickets();
    const filters = this.tickets.parseTicketQuery(query, admin);
    // viewCounts rides along rather than living on its own route: it labels
    // this exact list, and a separate endpoint would trigger a second
    // recalculation pass for numbers that must agree with the rows already
    // being returned here.
    //
    // The former `recompute` field ({ updated, rain1hMm } — the Hazard
    // Urgency pass and the city-wide rainfall behind the queue's rain
    // banner) was dropped from this response in manuscript revision
    // Phase 1, step 4, and the pass itself stopped running in step 7a.
    const [result, viewCounts] = await Promise.all([
      this.tickets.getTicketsForAdmin(filters),
      this.tickets.getViewCounts(admin),
    ]);
    return { ...result, viewCounts };
  }

  @Get('geo')
  async geo(
    @Query('office') officeParam: string | undefined,
    @CurrentAdmin() admin: AdminSession,
  ) {
    await this.operationalPriority.recalculateActiveTickets();
    const requestedOffice =
      officeParam === 'all' || officeParam === 'MEO' || officeParam === 'MDRRMO'
        ? officeParam
        : undefined;
    return this.tickets.getTicketsGeo(admin, requestedOffice);
  }

  @Get(':id')
  async detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
  ) {
    // Matches the original SSR page (app/admin/tickets/[id]/page.tsx),
    // which always recalculated right before reading — otherwise the
    // Operational Priority shown could lag behind the queue by up to the
    // caller's own recalculation cadence. (The Hazard Urgency recompute
    // that also ran here was removed in manuscript revision Phase 1, step 7a.)
    await this.operationalPriority.recalculateActiveTickets();
    const detail = await this.tickets.getTicketDetail(id, admin);
    if (!detail) throw new NotFoundException();
    // Folded into the existing detail response rather than a second
    // frontend fetch (Batch 3 §13) — a plain read, no extra authorization
    // check needed here since getTicketDetail above already enforced
    // assertOfficeAccess for this exact ticket/admin pair.
    const operationalAssessment = await this.assessments.getForTicket(id);
    // DENR-MGB Hazard Information (manuscript revision Phase 4, step 4b),
    // advisory and staff-only, same access as above. When the ticket has no
    // usable result (not yet checked, or temporarily unavailable for over 10
    // minutes) a background lookup starts here and is not awaited.
    const hazardInformation = await this.hazardInformation.forTicketDetail(
      detail.ticket,
    );
    return { ...detail, operationalAssessment, hazardInformation };
  }

  // Staff Retry for Hazard Information: same 403/404 as Ticket Detail, 409
  // for a merged-away or closed ticket or a category without a lookup, 429
  // within 60 s of the ticket's last attempt. Waits for the lookup (at most
  // 8 s) and returns the new state.
  @Post(':id/hazard-information/retry')
  async retryHazardInformation(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
  ) {
    return this.hazardInformation.retry(id, admin);
  }

  @Post(':id/assessment')
  async saveAssessment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
    @Body() body: OperationalAssessmentInput,
  ) {
    const assessment = await this.assessments.upsert(id, admin, body);
    return { ok: true, assessment };
  }

  @Get(':id/priority-context')
  async priorityContext(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const context = await this.tickets.getTicketPriorityContext(id, admin);
    if (!context) throw new NotFoundException();
    return context;
  }

  // Suggested related tickets (manuscript revision Phase 3, step 3c):
  // read-only, same 403/404 as GET /admin/tickets/:id, own office only.
  @Get(':id/related-candidates')
  async relatedCandidates(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
  ) {
    const related = await this.related.forTicket(id, admin);
    if (!related) throw new NotFoundException();
    return related;
  }

  // These MUST stay declared above the @Post(':id/...') routes below. Nest
  // matches in declaration order, and 'bulk/reassign' matches the pattern
  // ':id/reassign' with :id = 'bulk' — which resolves to ParseIntPipe and
  // fails as "numeric string is expected" instead of reaching this handler.
  // A literal path segment does not win over a parameter by being more
  // specific; only declaration order decides.
  //
  // These return 200 with a { ok, skipped } body even when nothing moved:
  // a bulk action over a mixed selection has no single HTTP status that is
  // honest, and the caller needs the per-ticket reasons either way.
  @Post('bulk/advance-status')
  async bulkAdvanceStatus(
    @CurrentAdmin() admin: AdminSession,
    @Body('ticketIds') ticketIds: unknown,
  ) {
    return this.tickets.bulkAdvanceStatus(parseTicketIds(ticketIds), admin);
  }

  @Post('bulk/reassign')
  async bulkReassign(
    @CurrentAdmin() admin: AdminSession,
    @Body('ticketIds') ticketIds: unknown,
    @Body('toOffice') toOffice: unknown,
  ) {
    if (toOffice !== 'MEO' && toOffice !== 'MDRRMO') {
      throw new BadRequestException('toOffice must be MEO or MDRRMO');
    }
    return this.tickets.bulkReassign(
      parseTicketIds(ticketIds),
      admin,
      toOffice,
    );
  }

  // FileInterceptor passes non-multipart requests straight through with no
  // file attached, so this one route handles both the plain-POST status
  // transitions and the Resolved-with-photo case, matching the original
  // conditional-on-content-type Next handler.
  @Post(':id/status')
  @UseInterceptors(FileInterceptor('image'))
  async advanceStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('notes') notes: string | undefined,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES }),
          new FileTypeValidator({ fileType: ALLOWED_IMAGE_TYPES }),
        ],
      }),
    )
    image: Express.Multer.File | undefined,
  ) {
    const result = await this.tickets.advanceStatus(
      id,
      admin,
      notes,
      image?.buffer,
    );
    return { ok: true, ...result };
  }

  @Post(':id/reassign')
  async reassign(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('toOffice') toOffice: unknown,
  ) {
    if (toOffice !== 'MEO' && toOffice !== 'MDRRMO') {
      throw new BadRequestException('toOffice must be MEO or MDRRMO');
    }
    const result = await this.tickets.reassignOffice(id, admin, toOffice);
    return { ok: true, assignedOffice: result.assignedOffice };
  }

  @Post(':id/refer')
  async refer(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('agency') agency: unknown,
    @Body('note') note: unknown,
  ) {
    if (typeof agency !== 'string') {
      throw new BadRequestException('agency is required');
    }
    if (note !== undefined && typeof note !== 'string') {
      throw new BadRequestException('note must be a string');
    }
    await this.tickets.logReferral(id, admin, agency, note);
    return { ok: true };
  }

  @Post(':id/reject')
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminSession,
    @Body('reason') reason: unknown,
  ) {
    if (typeof reason !== 'string') {
      throw new BadRequestException('reason is required');
    }
    const result = await this.tickets.rejectTicket(id, admin, reason);
    return { ok: true, ...result };
  }
}
