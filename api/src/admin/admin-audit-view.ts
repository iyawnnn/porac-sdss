import type {
  AdminAuditItem,
  AdminAuditActionType,
} from '../contracts/admin-audit';

const status = [
  'Reported',
  'Under Review',
  'In Progress',
  'Resolved',
  'Rejected',
];
const workStatus = ['pending', 'in_progress', 'completed', 'cancelled'];
const office = ['MEO', 'MDRRMO'];
const account = ['PERSONNEL', 'SYSTEM_ADMIN'];
const outcome = ['MUNICIPAL_ACTION_COMPLETED', 'EXTERNAL_REFERRAL'];
// Source paths -> validators. No blanket copying, arbitrary strings, nested
// response values, ids of assignees, coordinates, or free text. Category
// names are converted from the known category list to stable short codes.
type Rule =
  | readonly string[]
  | 'boolean'
  | 'count'
  | 'category'
  | 'category_code'
  | 'date'
  | 'array_count';
export const AUDIT_DETAIL_ALLOWLIST = {
  report_exported: {
    kind: ['tickets', 'flagged', 'work_orders'],
    rowCount: 'count',
    office,
    status: [
      ...status,
      ...workStatus,
      'all',
      'active',
      'dismissed',
      'quarantined',
      'duplicate',
    ],
    category: 'category_code',
    barangayId: 'count',
    categoryReview: 'boolean',
    overdue: 'boolean',
    flag: [
      'LOCATION_MISMATCH',
      'STALE_EVIDENCE',
      'MISSING_METADATA',
      'TIMESTAMP_ANOMALY',
      'DUPLICATE_IMAGE',
      'BOUNDARY_FALLBACK',
    ],
    dateFrom: 'date',
    dateTo: 'date',
    searchApplied: 'boolean',
    assigneeFiltered: 'boolean',
    selectionCount: 'count',
  },
  admin_created: { accountType: account, isFocal: 'boolean', office },
  admin_role_updated: {
    'from.accountType': account,
    'to.accountType': account,
    'from.isFocal': 'boolean',
    'to.isFocal': 'boolean',
    'from.office': office,
    'to.office': office,
    sessionsEnded: 'boolean',
  },
  admin_password_changed: {},
  admin_password_reset: {},
  admin_deactivated: {
    'from.active': 'boolean',
    'to.active': 'boolean',
    sessionsEnded: 'boolean',
  },
  admin_reactivated: {
    'from.active': 'boolean',
    'to.active': 'boolean',
    sessionsEnded: 'boolean',
  },
  admin_login: {},
  admin_login_failed: {},
  ticket_status_advanced: { from: status, to: status, outcome },
  ticket_reassigned: { from: office, to: office },
  ticket_referral_noted: {},
  ticket_rejected: { from: status, to: status },
  ticket_returned_to_review: {
    from: status,
    to: status,
    previousOutcome: outcome,
  },
  ticket_category_corrected: {
    oldValue: 'category',
    newValue: 'category',
    officeChanged: 'boolean',
    fromOffice: office,
    toOffice: office,
  },
  ticket_location_corrected: {},
  report_moderated: { action: ['dismiss', 'quarantine', 'duplicate'] },
  work_order_created: { assignedOffice: office, hasDueDate: 'boolean' },
  work_order_updated: {},
  work_order_status_changed: { from: workStatus, to: workStatus },
  work_order_completed: { from: workStatus, to: workStatus },
  work_order_cancelled: { from: workStatus, to: workStatus },
  report_acknowledged: {},
  report_screened: {},
  report_escalated: {},
  report_severity_screened: {
    oldStatus: [
      'NOT_REVIEWED',
      'NO_CONCERN_NOTED',
      'REQUIRES_OPERATIONAL_VALIDATION',
    ],
    newStatus: [
      'NOT_REVIEWED',
      'NO_CONCERN_NOTED',
      'REQUIRES_OPERATIONAL_VALIDATION',
    ],
  },
  operational_assessment_created: {},
  operational_assessment_updated: {},
  ticket_merged: { movedReportIds: 'array_count' },
  report_removed_from_ticket: {},
  report_regrouped: {},
} satisfies Record<AdminAuditActionType, Record<string, Rule>>;

export interface AuditStoredRow {
  id: number;
  created_at: Date | string;
  action_type: string;
  target_type: string;
  target_id: number;
  actor_admin_id: number;
  actor_name: string;
  actor_role: string;
  actor_account_type: 'PERSONNEL' | 'SYSTEM_ADMIN' | null;
  actor_is_focal: boolean | null;
  actor_office: string | null;
  metadata: unknown;
  target_name?: string | null;
}

// Includes legacy category names solely for reading immutable history.
const CATEGORY_CODES: Record<string, string> = {
  'Pothole / Road Surface Damage': 'ROAD_SURFACE_DAMAGE',
  'Uneven Sidewalk': 'UNEVEN_SIDEWALK',
  'Damaged Manhole Cover': 'DAMAGED_MANHOLE_COVER',
  'Clogged Drainage / Damaged Culvert': 'DRAINAGE_CULVERT',
  'Streetlight Out': 'STREETLIGHT_OUT',
  'Localized Flooding': 'LOCALIZED_FLOODING',
  'Rain-Induced Slope Failure/Landslide': 'SLOPE_FAILURE_LANDSLIDE',
  'Lahar or Volcanic Debris-Flow Threat': 'LAHAR_DEBRIS_FLOW',
  'Fallen Tree or Storm-Related Road Obstruction': 'STORM_ROAD_OBSTRUCTION',
  'Illegal Dumping Affecting Drainage or Road': 'ILLEGAL_DUMPING',
  'Overgrown Vegetation Obstructing Road or Signage': 'OVERGROWN_VEGETATION',
  'Leaking Pipe / Water Supply Concern': 'WATER_SUPPLY_CONCERN',
  'Other Minor Infrastructure Hazard': 'OTHER_INFRASTRUCTURE_HAZARD',
  Flooding: 'FLOODING',
  Landslide: 'LANDSLIDE',
  'Clogged Drain': 'CLOGGED_DRAIN',
  'Fallen Tree': 'FALLEN_TREE',
  Pothole: 'POTHOLE',
  'Leaking Pipe': 'LEAKING_PIPE',
  'Uncollected Garbage': 'UNCOLLECTED_GARBAGE',
  'Illegal Dumping': 'ILLEGAL_DUMPING',
  'Overgrown Vegetation': 'OVERGROWN_VEGETATION',
  Other: 'OTHER',
  'Drainage / Culvert / Manhole Issue': 'LEGACY_DRAINAGE_CULVERT_MANHOLE',
  'Landslide / Slope Failure': 'SLOPE_FAILURE_LANDSLIDE',
  'Lahar / Debris-Flow Threat': 'LAHAR_DEBRIS_FLOW',
  'Fallen Tree / Storm-Related Obstruction': 'STORM_ROAD_OBSTRUCTION',
};

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function auditDetails(
  action: string,
  metadata: unknown,
): AdminAuditItem['details'] {
  if (!Object.hasOwn(AUDIT_DETAIL_ALLOWLIST, action)) return {};
  const rules = AUDIT_DETAIL_ALLOWLIST[
    action as AdminAuditActionType
  ] as Record<string, Rule>;
  const details: AdminAuditItem['details'] = {};
  for (const [path, rule] of Object.entries(rules)) {
    const value = path
      .split('.')
      .reduce<unknown>((v, key) => object(v)[key], metadata);
    const key = path.replace('.', '_');
    if (value === null) {
      details[key] = null;
      continue;
    }
    if (rule === 'boolean' && typeof value === 'boolean') details[key] = value;
    else if (
      rule === 'count' &&
      Number.isSafeInteger(value) &&
      Number(value) >= 0
    )
      details[key] = Number(value);
    else if (
      rule === 'array_count' &&
      Array.isArray(value) &&
      value.every((v) => Number.isSafeInteger(v) && v > 0)
    )
      details.moved_reports_count = value.length;
    else if (
      rule === 'date' &&
      typeof value === 'string' &&
      /^(?:\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/.test(
        value,
      ) &&
      Number.isFinite(Date.parse(value))
    )
      details[key] = value;
    else if (
      rule === 'category_code' &&
      typeof value === 'string' &&
      (Object.hasOwn(CATEGORY_CODES, value) ||
        Object.values(CATEGORY_CODES).includes(value))
    )
      details[key] = CATEGORY_CODES[value] ?? value;
    else if (
      rule === 'category' &&
      typeof value === 'string' &&
      Object.hasOwn(CATEGORY_CODES, value)
    )
      details[key] = CATEGORY_CODES[value];
    else if (
      Array.isArray(rule) &&
      typeof value === 'string' &&
      value.length <= 40 &&
      /^[A-Za-z][A-Za-z_ ]*$/.test(value) &&
      rule.includes(value)
    )
      details[key] = value;
  }
  return details;
}

export function auditItem(row: AuditStoredRow): AdminAuditItem {
  const targetType = [
    'admin',
    'ticket',
    'report',
    'work_order',
    'export',
  ].includes(row.target_type)
    ? (row.target_type as AdminAuditItem['target_type'])
    : 'unknown';
  const isFocal =
    row.actor_is_focal === true ||
    (row.actor_is_focal == null && row.actor_role === 'focal');
  const system =
    row.actor_is_focal == null
      ? row.actor_role === 'system_admin'
      : row.actor_account_type === 'SYSTEM_ADMIN';
  const label = isFocal
    ? 'Focal Personnel'
    : system
      ? 'System Administrator/MIS'
      : row.actor_office === 'MEO'
        ? 'MEO Personnel'
        : row.actor_office === 'MDRRMO'
          ? 'MDRRMO Personnel'
          : 'Personnel — office not recorded';
  const targets = {
    ticket: 'Ticket',
    report: 'Report',
    work_order: 'Work order',
    admin: 'Staff',
    unknown: 'Target',
    export: 'Export by staff',
  };
  return {
    id: row.id,
    created_at: new Date(row.created_at).toISOString(),
    action: /^[a-z][a-z_]{0,63}$/.test(row.action_type)
      ? row.action_type
      : 'unknown',
    target_type: targetType,
    target_id: row.target_id,
    target_label:
      row.target_type === 'admin'
        ? row.target_name || 'Staff — name not recorded'
        : `${targets[targetType]} #${row.target_id}`,
    actor: {
      id: row.actor_admin_id,
      name: row.actor_name,
      account_type: row.actor_account_type,
      is_focal: row.actor_is_focal,
      display_label: label,
    },
    details: auditDetails(row.action_type, row.metadata),
  };
}
