import { BadRequestException, Injectable } from '@nestjs/common';
import type { AdminSession } from '../auth/session.service';
import { toCsv } from '../common/utils/csv';
import { TicketsService } from './tickets.service';
import { ModerationService } from './moderation.service';
import { WorkOrdersService, type WorkOrderExportRow } from './work-orders.service';

export interface ReportDateRange {
  dateFrom?: Date;
  dateTo?: Date;
}

// Export-only. Kept out of AdminTicketFilters/parseTicketQuery on purpose:
// the list endpoint must never grow an id whitelist (CLAUDE.md — export-only
// params are parsed here, never mixed into the list query shape).
const EXPORT_IDS_MAX = 500;

function parseIdsParam(value: string | undefined, label = 'ticket'): number[] | undefined {
  if (!value) return undefined;
  const ids = [
    ...new Set(value.split(',').map((part) => Number(part.trim()))),
  ];
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new BadRequestException(
      `ids must be a comma-separated list of ${label} ids.`,
    );
  }
  if (ids.length > EXPORT_IDS_MAX) {
    throw new BadRequestException(
      `ids must contain at most ${EXPORT_IDS_MAX} ${label} ids.`,
    );
  }
  return ids.length ? ids : undefined;
}

function parseDateParam(value: string | undefined, label: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label} is not a valid date.`);
  }
  return date;
}

function isOverdue(row: WorkOrderExportRow): boolean {
  if (!row.due_date || row.status === 'completed' || row.status === 'cancelled') return false;
  return row.due_date.getTime() < Date.now();
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly tickets: TicketsService,
    private readonly workOrders: WorkOrdersService,
    private readonly moderation: ModerationService,
  ) {}

  // Reuses TicketsService.parseTicketQuery / WorkOrdersService.parseQuery
  // for every filter but the date range — that's also where office scoping
  // (resolveOfficeScope) lives, so an export can never see more than its
  // caller's own list/geo endpoints already allow.
  parseDateRange(query: Record<string, string | undefined>): ReportDateRange {
    const dateFrom = parseDateParam(query.dateFrom, 'dateFrom');
    const dateTo = parseDateParam(query.dateTo, 'dateTo');
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be before dateTo.');
    }
    return { dateFrom, dateTo };
  }

  async ticketsCsv(
    query: Record<string, string | undefined>,
    admin: AdminSession,
  ): Promise<string> {
    const filters = this.tickets.parseTicketQuery(query, admin);
    const { dateFrom, dateTo } = this.parseDateRange(query);
    const ids = parseIdsParam(query.ids);
    const rows = await this.tickets.getTicketsForExport({
      ...filters,
      dateFrom,
      dateTo,
      ids,
    });

    return toCsv(rows, [
      { header: 'Ticket ID', value: (r) => r.id },
      { header: 'Status', value: (r) => r.status },
      { header: 'Assigned Office', value: (r) => r.assigned_office },
      { header: 'Urgency Band', value: (r) => r.urgency_band },
      { header: 'Hazard Urgency Score', value: (r) => r.priority_score },
      { header: 'Category', value: (r) => r.category },
      { header: 'Barangay', value: (r) => r.barangay_name },
      { header: 'Report Count', value: (r) => r.member_count },
      { header: 'Created At', value: (r) => new Date(r.created_at).toISOString() },
      { header: 'Updated At', value: (r) => new Date(r.updated_at).toISOString() },
    ]);
  }

  // Flagged Reports export. Same delegation rule as the two above: every
  // filter but the id whitelist comes from the list endpoint's own parser
  // (ModerationService.parseModerationQuery), which is where office scoping
  // is applied — there is no second authorization path to keep in sync.
  //
  // The risk score the UI shows is deliberately NOT a column: computeRiskScore
  // lives in lib/utils/flag-risk.ts (frontend-only), and putting a second copy
  // of those weights in the API would create exactly the kind of drifting
  // duplicate definition the urgency/scoring pair already has to change-control.
  // `Flags` carries the underlying signals the score is derived from instead.
  async flaggedCsv(
    query: Record<string, string | undefined>,
    admin: AdminSession,
  ): Promise<string> {
    const filters = this.moderation.parseModerationQuery(query, admin);
    const ids = parseIdsParam(query.ids, 'report');
    const rows = await this.moderation.getModerationForExport({ ...filters, ids });

    return toCsv(rows, [
      { header: 'Report ID', value: (r) => r.id },
      { header: 'Ticket ID', value: (r) => r.ticket_id },
      { header: 'Title', value: (r) => r.title },
      { header: 'Category', value: (r) => r.category },
      { header: 'Barangay', value: (r) => r.barangay_name },
      { header: 'Assigned Office', value: (r) => r.assigned_office },
      { header: 'Citizen', value: (r) => r.citizen_name },
      { header: 'Citizen Severity', value: (r) => r.citizen_severity },
      { header: 'Flags', value: (r) => r.flags.join(' | ') },
      { header: 'Location Mismatch (m)', value: (r) => r.location_mismatch_m },
      // Pending is the absence of a decision, not a stored status.
      { header: 'Moderation Status', value: (r) => r.moderation_status ?? 'pending' },
      { header: 'Moderated By', value: (r) => r.moderated_by },
      { header: 'Moderated At', value: (r) => r.moderated_at && new Date(r.moderated_at).toISOString() },
      { header: 'Submitted At', value: (r) => new Date(r.created_at).toISOString() },
    ]);
  }

  async workOrdersCsv(
    query: Record<string, string | undefined>,
    admin: AdminSession,
  ): Promise<string> {
    const filters = this.workOrders.parseQuery(query, admin);
    const { dateFrom, dateTo } = this.parseDateRange(query);
    const rows = await this.workOrders.getWorkOrdersForExport({ ...filters, dateFrom, dateTo });

    return toCsv(rows, [
      { header: 'Work Order ID', value: (r) => r.id },
      { header: 'Ticket ID', value: (r) => r.ticket_id },
      { header: 'Title', value: (r) => r.title },
      { header: 'Assigned Office', value: (r) => r.assigned_office },
      { header: 'Assigned Admin Name', value: (r) => r.assigned_admin_name },
      { header: 'Assigned Admin Email', value: (r) => r.assigned_admin_email },
      { header: 'Status', value: (r) => r.status },
      { header: 'Overdue', value: (r) => isOverdue(r) },
      { header: 'Due Date', value: (r) => r.due_date?.toISOString() },
      { header: 'Completed At', value: (r) => r.completed_at?.toISOString() },
      { header: 'Created At', value: (r) => r.created_at.toISOString() },
      { header: 'Updated At', value: (r) => r.updated_at.toISOString() },
    ]);
  }
}
