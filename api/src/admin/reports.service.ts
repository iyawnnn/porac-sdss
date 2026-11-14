import { BadRequestException, Injectable } from '@nestjs/common';
import type { AdminSession } from '../auth/session.service';
import { toCsv } from '../common/utils/csv';
import { parsePositiveInt } from '../common/pipes/positive-int.pipe';
import { AdminAuditService } from './admin-audit.service';
import { auditDetails } from './admin-audit-view';
import {
  ReportExportQueries,
  parseReportExportFilters,
  parseExportTop,
} from './report-export-queries';
import { resolveOfficeScope } from '../common/authz/admin-scope';
import { assertExportLimit } from './export-limit';
import { TicketsService } from './tickets.service';
import { ModerationService } from './moderation.service';
import {
  WorkOrdersService,
  type WorkOrderExportRow,
} from './work-orders.service';

export interface ReportDateRange {
  dateFrom?: Date;
  dateTo?: Date;
}

// Export-only. Kept out of AdminTicketFilters/parseTicketQuery on purpose:
// the list endpoint must never grow an id whitelist (CLAUDE.md — export-only
// params are parsed here, never mixed into the list query shape).
const EXPORT_IDS_MAX = 500;

function parseIdsParam(
  value: string | undefined,
  label = 'ticket',
): number[] | undefined {
  if (!value) return undefined;
  let ids: number[];
  try {
    ids = [
      ...new Set(
        value.split(',').map((part) => parsePositiveInt(part.trim(), label)),
      ),
    ];
  } catch {
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

function parseDateParam(
  value: string | undefined,
  label: string,
): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label} is not a valid date.`);
  }
  return date;
}

function isOverdue(row: WorkOrderExportRow): boolean {
  if (!row.due_date || row.status === 'completed' || row.status === 'cancelled')
    return false;
  return row.due_date.getTime() < Date.now();
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly tickets: TicketsService,
    private readonly workOrders: WorkOrdersService,
    private readonly moderation: ModerationService,
    private readonly audit: AdminAuditService,
    private readonly exportQueries: ReportExportQueries,
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

    assertExportLimit(rows);
    const csv = toCsv(rows, [
      { header: 'Ticket ID', value: (r) => r.id },
      { header: 'Status', value: (r) => r.status },
      { header: 'Assigned Office', value: (r) => r.assigned_office },
      // Replaced the former 'Urgency Band' / 'Hazard Urgency Score' columns
      // (manuscript revision Phase 1, step 4). The raw 1-100 value only; the
      // Low/Medium/High word the queue shows next to it is a display band.
      { header: 'Operational Priority', value: (r) => r.priority_index },
      { header: 'Category', value: (r) => r.category },
      // DENR-MGB susceptibility in the source's own terms, advisory, never a
      // score (manuscript revision Phase 4, step 4b), e.g. "Flood: MF
      // (Moderate Susceptibility to Flooding)" or "Not applicable".
      { header: 'Hazard Information', value: (r) => r.hazard_summary },
      { header: 'Barangay', value: (r) => r.barangay_name },
      { header: 'Report Count', value: (r) => r.member_count },
      {
        header: 'Created At',
        value: (r) => new Date(r.created_at).toISOString(),
      },
      {
        header: 'Updated At',
        value: (r) => new Date(r.updated_at).toISOString(),
      },
      // Retained for column compatibility; merged-away tickets are excluded.
      { header: 'Merged into', value: (r) => r.merged_into_ticket_id },
      // Phase 5, step 5c (decision 13). Blank while unresolved, and the
      // outcome is blank for a legacy Resolved ticket (no resolved_at),
      // whatever migration 0036 stored for it. Resolution notes stay out of
      // the export.
      {
        header: 'Resolution Outcome',
        value: (r) => (r.resolved_at ? r.resolution_outcome : null),
      },
      {
        header: 'Resolved At',
        value: (r) => r.resolved_at && new Date(r.resolved_at).toISOString(),
      },
    ]);
    await this.auditExport(admin, 'tickets', rows.length, {
      ...filters,
      dateFrom,
      dateTo,
      ids,
    });
    return csv;
  }

  // Flagged Reports export. Same delegation rule as the two above: every
  // filter but the id whitelist comes from the list endpoint's own parser
  // (ModerationService.parseModerationQuery), which is where office scoping
  // is applied — there is no second authorization path to keep in sync.
  //
  // The risk score the UI shows is deliberately NOT a column: computeRiskScore
  // lives in lib/utils/flag-risk.ts (frontend-only), and putting a second copy
  // of those weights in the API would create exactly the kind of drifting
  // duplicate definition the scoring.ts pair already has to change-control.
  // `Flags` carries the underlying signals the score is derived from instead.
  async flaggedCsv(
    query: Record<string, string | undefined>,
    admin: AdminSession,
  ): Promise<string> {
    const filters = this.moderation.parseModerationQuery(query, admin);
    const ids = parseIdsParam(query.ids, 'report');
    const rows = await this.moderation.getModerationForExport({
      ...filters,
      ids,
    });

    assertExportLimit(rows);
    const csv = toCsv(rows, [
      { header: 'Report ID', value: (r) => r.id },
      { header: 'Ticket ID', value: (r) => r.ticket_id },
      { header: 'Tracking Reference', value: (r) => r.tracking_reference },
      { header: 'Category', value: (r) => r.category },
      { header: 'Barangay', value: (r) => r.barangay_name },
      { header: 'Assigned Office', value: (r) => r.assigned_office },
      { header: 'Citizen Severity', value: (r) => r.citizen_severity },
      { header: 'Flags', value: (r) => r.flags?.join(' | ') ?? '' },
      { header: 'Location Mismatch (m)', value: (r) => r.location_mismatch_m },
      // Pending is the absence of a decision, not a stored status.
      {
        header: 'Moderation Status',
        value: (r) => r.moderation_status ?? 'pending',
      },
      { header: 'Moderated By', value: (r) => r.moderated_by },
      {
        header: 'Moderated At',
        value: (r) => r.moderated_at && new Date(r.moderated_at).toISOString(),
      },
      {
        header: 'Submitted At',
        value: (r) => new Date(r.created_at).toISOString(),
      },
    ]);
    await this.auditExport(admin, 'flagged', rows.length, { ...filters, ids });
    return csv;
  }

  async workOrdersCsv(
    query: Record<string, string | undefined>,
    admin: AdminSession,
  ): Promise<string> {
    const filters = this.workOrders.parseQuery(query, admin);
    const { dateFrom, dateTo } = this.parseDateRange(query);
    const rows = await this.workOrders.getWorkOrdersForExport({
      ...filters,
      dateFrom,
      dateTo,
    });

    assertExportLimit(rows);
    const csv = toCsv(rows, [
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
      {
        header: 'Cancelled At',
        value: (r) =>
          r.status === 'cancelled' ? r.cancelled_at?.toISOString() : null,
      },
      {
        header: 'Cancellation Reason',
        value: (r) => (r.status === 'cancelled' ? r.cancellation_reason : null),
      },
      {
        header: 'Replacement Work Order ID',
        value: (r) =>
          r.status === 'cancelled' ? r.replacement_work_order_id : null,
      },
      { header: 'Created At', value: (r) => r.created_at.toISOString() },
      { header: 'Updated At', value: (r) => r.updated_at.toISOString() },
    ]);
    await this.auditExport(admin, 'work_orders', rows.length, {
      ...filters,
      dateFrom,
      dateTo,
    });
    return csv;
  }

  async submittedReportsCsv(
    query: Record<string, string | undefined>,
    admin: AdminSession,
  ): Promise<string> {
    const filters = parseReportExportFilters(query, admin, true);
    const rows = await this.exportQueries.submitted(filters);
    assertExportLimit(rows);
    const csv = toCsv(rows, [
      { header: 'Tracking Reference', value: (r) => r.tracking_reference },
      { header: 'Ticket ID', value: (r) => r.ticket_id },
      { header: 'Ticket Status', value: (r) => r.status },
      { header: 'Assigned Office', value: (r) => r.assigned_office },
      { header: 'Category', value: (r) => r.category },
      { header: 'Submitted Category', value: (r) => r.submitted_category },
      { header: 'Barangay', value: (r) => r.barangay_name },
      { header: 'Citizen Severity', value: (r) => r.citizen_severity },
      { header: 'Evidence Flags', value: (r) => r.flags?.join('; ') ?? '' },
      {
        header: 'Severity Screening Status',
        value: (r) => r.severity_screening_status,
      },
      {
        header: 'Moderation Status',
        value: (r) => r.moderation_status ?? 'pending',
      },
      {
        header: 'Submitted At',
        value: (r) => new Date(r.created_at).toISOString(),
      },
    ]);
    await this.auditExport(admin, 'submitted_reports', rows.length, filters);
    return csv;
  }

  async operationalAssessmentsCsv(
    query: Record<string, string | undefined>,
    admin: AdminSession,
  ): Promise<string> {
    const filters = parseReportExportFilters(query, admin);
    const rows = await this.exportQueries.assessments(filters);
    assertExportLimit(rows);
    const csv = toCsv(rows, [
      { header: 'Ticket ID', value: (r) => r.ticket_id },
      { header: 'Assigned Office', value: (r) => r.assigned_office },
      { header: 'Category', value: (r) => r.category },
      { header: 'Ticket Status', value: (r) => r.status },
      { header: 'Operational Priority', value: (r) => r.priority_index },
      {
        header: 'Resolution Outcome',
        value: (r) => (r.resolved_at ? r.resolution_outcome : null),
      },
      {
        header: 'Resolved At',
        value: (r) => r.resolved_at && new Date(r.resolved_at).toISOString(),
      },
      {
        header: 'Assessed At',
        value: (r) => new Date(r.created_at).toISOString(),
      },
      { header: 'Assessed By', value: (r) => r.assessed_by_name },
      { header: 'Assessed Conditions', value: (r) => r.assessed_conditions },
      { header: 'Safety Implications', value: (r) => r.safety_implications },
      {
        header: 'Operational Constraints',
        value: (r) => r.operational_constraints.selected.join('; '),
      },
      {
        header: 'Constraint Notes',
        value: (r) =>
          Object.entries(r.operational_constraints.notes)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, note]) => `${key}: ${note}`)
            .join('; '),
      },
      { header: 'Recommended Action', value: (r) => r.recommended_action },
      { header: 'Interim Mitigation', value: (r) => r.interim_mitigation },
      {
        header: 'Deferment or Referral Reason',
        value: (r) => r.deferment_or_referral_reason,
      },
      { header: 'Remarks', value: (r) => r.remarks },
      { header: 'Actual Action', value: (r) => r.actual_action },
      {
        header: 'Supporting Evidence URL',
        value: (r) => r.supporting_evidence_url,
      },
      { header: 'Work Orders Pending', value: (r) => r.pending },
      { header: 'Work Orders In Progress', value: (r) => r.in_progress },
      { header: 'Work Orders Completed', value: (r) => r.completed },
      { header: 'Work Orders Cancelled', value: (r) => r.cancelled },
    ]);
    await this.auditExport(
      admin,
      'operational_assessments',
      rows.length,
      filters,
    );
    return csv;
  }

  async priorityIncidentsCsv(
    query: Record<string, string | undefined>,
    admin: AdminSession,
  ): Promise<string> {
    const office = resolveOfficeScope(admin, undefined);
    const top = parseExportTop(query.top);
    const rows = await this.exportQueries.priority(office, top);
    assertExportLimit(rows);
    const ranked = rows.map((row, index) => ({ ...row, rank: index + 1 }));
    const csv = toCsv(ranked, [
      { header: 'Rank', value: (r) => r.rank },
      { header: 'Ticket ID', value: (r) => r.ticket_id },
      { header: 'Status', value: (r) => r.status },
      { header: 'Assigned Office', value: (r) => r.assigned_office },
      { header: 'Operational Priority', value: (r) => r.priority_index },
      { header: 'Category', value: (r) => r.category },
      { header: 'Hazard Information', value: (r) => r.hazard_summary },
      { header: 'Barangay', value: (r) => r.barangay_name },
      { header: 'Report Count', value: (r) => r.member_count },
      {
        header: 'Created At',
        value: (r) => new Date(r.created_at).toISOString(),
      },
      {
        header: 'Updated At',
        value: (r) => new Date(r.updated_at).toISOString(),
      },
    ]);
    await this.auditExport(admin, 'priority_incidents', rows.length, {
      office,
      status: 'active',
      top,
    });
    return csv;
  }

  private async auditExport(
    admin: AdminSession,
    kind:
      | 'tickets'
      | 'flagged'
      | 'work_orders'
      | 'submitted_reports'
      | 'operational_assessments'
      | 'priority_incidents',
    rowCount: number,
    filters: Record<string, unknown>,
  ): Promise<void> {
    // Sanitize before storage too: never retain free-text search or staff ids.
    const metadata = auditDetails('report_exported', {
      ...filters,
      status:
        filters.status ??
        (kind === 'tickets'
          ? 'active'
          : kind === 'flagged'
            ? 'pending'
            : 'all'),
      kind,
      rowCount,
      dateFrom:
        filters.dateFrom instanceof Date
          ? filters.dateFrom.toISOString()
          : filters.from,
      dateTo:
        filters.dateTo instanceof Date
          ? filters.dateTo.toISOString()
          : filters.to,
      searchApplied: Boolean(filters.search),
      assigneeFiltered: Boolean(filters.assignedAdminId),
      selectionCount: Array.isArray(filters.ids)
        ? filters.ids.length
        : undefined,
    });
    await this.audit.logRequired({
      actor: admin,
      actionType: 'report_exported',
      targetType: 'export',
      targetId: admin.adminId,
      targetSummary: 'Report export',
      metadata,
    });
  }
}
