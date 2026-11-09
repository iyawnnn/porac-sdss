import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  InventoryError,
  type InventoryOptions,
} from './test-data-inventory-options';
import { AUDIT_ACTIONS } from '../../src/contracts/admin-audit';

// Minimal projections: never select password/token hashes, notes, photo URLs,
// names, IP addresses, provider subjects, notification text or audit snapshots.
export const INVENTORY_TABLES = {
  citizens: 'id,email,created_at',
  admins: 'id,email,created_at,is_active',
  tickets: 'id,created_at,status,merged_into_ticket_id,resolved_by_admin_id',
  reports:
    'id,created_at,title,tracking_reference,ticket_id,citizen_id,severity_screened_by_admin_id',
  work_orders:
    'id,created_at,title,ticket_id,status,assigned_admin_id,created_by_admin_id,cancelled_by_admin_id,replacement_work_order_id',
  operational_assessments: 'id,created_at,ticket_id,assessed_by_admin_id',
  acknowledgments: 'id,ticket_id,acknowledged_by_admin_id',
  report_intake_actions: 'id,report_id,actor_admin_id',
  routing_actions: 'id,ticket_id,admin_id',
  status_history: 'id,ticket_id,admin_id',
  office_reassignments: 'id,ticket_id,admin_id',
  work_order_status_history: 'id,work_order_id,admin_id',
  resolution_feedback: 'id,ticket_id,citizen_id',
  verifications: 'id,ticket_id,citizen_id',
  citizen_identities: 'id,citizen_id',
  password_reset_tokens: 'id,citizen_id',
  citizen_audit_events: 'id,citizen_id',
  admin_saved_views: 'id,admin_id',
  rate_limit_events: 'id,citizen_id',
  notifications: 'id,recipient_type,recipient_id,entity_type,entity_id,href',
  admin_audit_events:
    'id,actor_admin_id,target_type,target_id,action_type,metadata',
  hazard_information: 'id,ticket_id',
  rainfall_context: 'id,ticket_id',
} as const;
export type InventoryTable = keyof typeof INVENTORY_TABLES;
export type InventoryRow = Record<string, unknown> & { id: number };
export type InventorySnapshot = Record<InventoryTable, InventoryRow[]>;
type Ref = { table: InventoryTable; id: number };
export interface InventoryLink {
  source: Ref;
  target: Ref;
  via: string;
  audit: boolean;
  targetExists: boolean;
}
interface InventoryIssue {
  source: Ref;
  reason: string;
}
const key = (r: Ref) => r.table + ':' + r.id;
const ref = (table: InventoryTable, id: number): Ref => ({ table, id });
const numeric = (v: unknown): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null;
function text(v: unknown) {
  return typeof v === 'string' ? v : '';
}
function created(row: InventoryRow) {
  const value = row.created_at;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(text(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export const INVENTORY_RELATIONS: readonly (readonly [
  InventoryTable,
  string,
  InventoryTable,
])[] = [
  ['reports', 'ticket_id', 'tickets'],
  ['reports', 'citizen_id', 'citizens'],
  ['reports', 'severity_screened_by_admin_id', 'admins'],
  ['tickets', 'merged_into_ticket_id', 'tickets'],
  ['tickets', 'resolved_by_admin_id', 'admins'],
  ['work_orders', 'ticket_id', 'tickets'],
  ['work_orders', 'assigned_admin_id', 'admins'],
  ['work_orders', 'created_by_admin_id', 'admins'],
  ['work_orders', 'cancelled_by_admin_id', 'admins'],
  ['work_orders', 'replacement_work_order_id', 'work_orders'],
  ['operational_assessments', 'ticket_id', 'tickets'],
  ['operational_assessments', 'assessed_by_admin_id', 'admins'],
  ['acknowledgments', 'ticket_id', 'tickets'],
  ['acknowledgments', 'acknowledged_by_admin_id', 'admins'],
  ['report_intake_actions', 'report_id', 'reports'],
  ['report_intake_actions', 'actor_admin_id', 'admins'],
  ['routing_actions', 'ticket_id', 'tickets'],
  ['routing_actions', 'admin_id', 'admins'],
  ['status_history', 'ticket_id', 'tickets'],
  ['status_history', 'admin_id', 'admins'],
  ['office_reassignments', 'ticket_id', 'tickets'],
  ['office_reassignments', 'admin_id', 'admins'],
  ['work_order_status_history', 'work_order_id', 'work_orders'],
  ['work_order_status_history', 'admin_id', 'admins'],
  ['resolution_feedback', 'ticket_id', 'tickets'],
  ['resolution_feedback', 'citizen_id', 'citizens'],
  ['verifications', 'ticket_id', 'tickets'],
  ['citizen_identities', 'citizen_id', 'citizens'],
  ['password_reset_tokens', 'citizen_id', 'citizens'],
  ['citizen_audit_events', 'citizen_id', 'citizens'],
  ['admin_saved_views', 'admin_id', 'admins'],
  ['rate_limit_events', 'citizen_id', 'citizens'],
  ['hazard_information', 'ticket_id', 'tickets'],
  ['rainfall_context', 'ticket_id', 'tickets'],
];
const entityTables: Record<string, InventoryTable> = {
  admin: 'admins',
  citizen: 'citizens',
  report: 'reports',
  ticket: 'tickets',
  work_order: 'work_orders',
};
const entityTable = (value: unknown) =>
  Object.hasOwn(entityTables, text(value)) ? entityTables[text(value)] : null;
const metadataIds: Record<string, InventoryTable> = {
  ticketId: 'tickets',
  mergedTicketId: 'tickets',
  fromTicketId: 'tickets',
  toTicketId: 'tickets',
  newTicketId: 'tickets',
  reportId: 'reports',
  movedReportIds: 'reports',
  workOrderId: 'work_orders',
  replacementWorkOrderId: 'work_orders',
  assignedAdminId: 'admins',
  adminId: 'admins',
  citizenId: 'citizens',
  latestReferralId: 'routing_actions',
};
const canonical = new Set([
  'meo@porac.gov.ph',
  'mdrrmo@porac.gov.ph',
  'focal@porac.gov.ph',
  'sysadmin@porac.gov.ph',
  ...[1, 2, 3, 4, 5].map((n) => 'citizen' + n + '@porac.ph'),
]);

// No product data writes. The transaction enforces read-only even with owner credentials.
export async function readInventory(
  db: PostgresJsDatabase,
  options: InventoryOptions,
  rowLimit = 100_000,
) {
  if (!Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 100_000)
    throw new InventoryError('Inventory refused: invalid row limit.');
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
      await tx.execute(sql`SET LOCAL lock_timeout='3s'`);
      await tx.execute(
        sql`SET LOCAL idle_in_transaction_session_timeout='60s'`,
      );
      await tx.execute(sql`SET LOCAL search_path=pg_catalog,public`);
      const [state] =
        await tx.execute(sql`SELECT current_setting('transaction_read_only')='on' AS read_only,
      current_setting('transaction_isolation')='repeatable read' AS consistent,
      to_regclass('public.report_acknowledgments') IS NULL AS contracted,
      to_regclass('public.config') IS NULL AS config_gone,
      EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.admin_audit_events'::regclass AND tgname='admin_audit_events_append_only' AND tgenabled='O' AND tgtype=27 AND tgfoid=to_regprocedure('public.admin_audit_events_reject_update_delete()')) AS audit_guard,
      to_char(transaction_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS snapshot_at`);
      if (
        ![
          state.read_only,
          state.consistent,
          state.contracted,
          state.config_gone,
          state.audit_guard,
        ].every((v) => v === true)
      )
        throw new InventoryError(
          'Inventory refused: final schema or read-only audit protection is missing.',
        );
      const foreignKeys =
        await tx.execute(sql`SELECT s.relname AS source_table,sa.attname AS source_column,t.relname AS target_table,ta.attname AS target_column
      FROM pg_constraint c JOIN pg_class s ON s.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=s.relnamespace
      JOIN pg_class t ON t.oid=c.confrelid JOIN pg_namespace nt ON nt.oid=t.relnamespace
      CROSS JOIN LATERAL unnest(c.conkey,c.confkey) keys(source_id,target_id)
      JOIN pg_attribute sa ON sa.attrelid=s.oid AND sa.attnum=keys.source_id
      JOIN pg_attribute ta ON ta.attrelid=t.oid AND ta.attnum=keys.target_id
      WHERE c.contype='f' AND nt.nspname='public' AND ns.nspname='public'`);
      const known = new Set(
        INVENTORY_RELATIONS.map(([a, b, c]) => [a, b, c, 'id'].join('.')),
      );
      // The other half of the same-ticket replacement composite FK.
      known.add('work_orders.ticket_id.work_orders.ticket_id');
      if (
        foreignKeys.some(
          (f) =>
            Object.hasOwn(INVENTORY_TABLES, String(f.target_table)) &&
            !known.has(
              [
                f.source_table,
                f.source_column,
                f.target_table,
                f.target_column,
              ].join('.'),
            ),
        )
      )
        throw new InventoryError(
          'Inventory incomplete: an unhandled foreign-key relationship needs review.',
        );
      const snapshot = {} as InventorySnapshot;
      for (const table of Object.keys(INVENTORY_TABLES) as InventoryTable[]) {
        const rows = await tx.execute<InventoryRow>(
          sql`SELECT ${sql.raw(INVENTORY_TABLES[table])} FROM public.${sql.identifier(table)} ORDER BY id LIMIT ${rowLimit + 1}`,
        );
        if (rows.length > rowLimit)
          throw new InventoryError(
            'Inventory incomplete: row limit exceeded; no partial report is published.',
          );
        snapshot[table] = Array.from(rows);
      }
      return {
        snapshotAt: String(state.snapshot_at),
        ...buildInventory(snapshot, options),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

export function buildInventory(
  snapshot: InventorySnapshot,
  options: InventoryOptions,
) {
  const nodes = new Map<string, InventoryRow>();
  for (const [table, rows] of Object.entries(snapshot))
    for (const row of rows)
      nodes.set(key(ref(table as InventoryTable, row.id)), row);
  const links: InventoryLink[] = [],
    issues: InventoryIssue[] = [];
  const issueKeys = new Set<string>();
  const issue = (source: Ref, reason: string) => {
    const id = key(source) + ':' + reason;
    if (!issueKeys.has(id)) {
      issueKeys.add(id);
      issues.push({ source, reason });
    }
  };
  function link(
    source: Ref,
    table: InventoryTable,
    value: unknown,
    via: string,
    audit = false,
  ) {
    if (value == null) return;
    const id = numeric(value);
    if (id == null) {
      issue(source, 'unresolved_typed_id');
      return;
    }
    const target = ref(table, id);
    links.push({
      source,
      target,
      via,
      audit,
      targetExists: nodes.has(key(target)),
    });
    if (!nodes.has(key(target))) issue(source, 'referenced_row_missing');
  }
  for (const [table, column, target] of INVENTORY_RELATIONS)
    for (const row of snapshot[table])
      link(
        ref(table, row.id),
        target,
        row[column],
        column,
        table === 'citizen_audit_events',
      );
  for (const row of snapshot.verifications) {
    // Legacy text is not assumed to be a citizen ID unless canonical decimal.
    const value = text(row.citizen_id);
    if (/^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647)
      link(
        ref('verifications', row.id),
        'citizens',
        Number(value),
        'citizen_id_text',
      );
    else
      issue(
        ref('verifications', row.id),
        'legacy_verification_identity_unresolved',
      );
  }
  for (const row of snapshot.notifications) {
    const source = ref('notifications', row.id);
    if (row.recipient_id != null) {
      const table =
        row.recipient_type === 'admin'
          ? 'admins'
          : row.recipient_type === 'citizen'
            ? 'citizens'
            : null;
      if (table) link(source, table, row.recipient_id, 'recipient_id');
      else issue(source, 'unknown_notification_recipient');
    }
    if (row.entity_id != null) {
      const table = entityTable(row.entity_type);
      if (table) link(source, table, row.entity_id, 'entity_id');
      else issue(source, 'unknown_notification_entity');
    }
    if (row.href) {
      const match =
        /^\/(admin\/(?:tickets|work-orders|focal\/intake|intake)|dashboard\/reports)\/([1-9]\d*)(?:[?#].*)?$/.exec(
          text(row.href),
        );
      if (match)
        link(
          source,
          match[1] === 'admin/tickets'
            ? 'tickets'
            : match[1] === 'admin/work-orders'
              ? 'work_orders'
              : 'reports',
          Number(match[2]),
          'href',
        );
      else issue(source, 'notification_link_not_resolved');
    }
  }
  const audited = new Set<string>();
  for (const row of snapshot.admin_audit_events) {
    const source = ref('admin_audit_events', row.id);
    if (!(AUDIT_ACTIONS as readonly string[]).includes(text(row.action_type)))
      issue(source, 'unknown_audit_action');
    link(source, 'admins', row.actor_admin_id, 'actor_admin_id', true);
    // Export target_id is the requesting admin, not a report/entity ID.
    const table =
      row.target_type === 'export' ? 'admins' : entityTable(row.target_type);
    if (table) link(source, table, row.target_id, 'target_id', true);
    else issue(source, 'unknown_audit_target');
    function metadata(
      value: unknown,
      path: string,
      owner?: InventoryTable,
      depth = 0,
    ) {
      if (depth > 12) {
        issue(source, 'audit_metadata_depth_limit');
        return;
      }
      if (value == null) return;
      if (owner) {
        if (typeof value === 'object' && !Array.isArray(value)) {
          const item = value as Record<string, unknown>;
          if (Object.keys(item).some((k) => k !== 'from' && k !== 'to'))
            issue(source, 'unknown_typed_audit_metadata');
          for (const k of ['from', 'to'])
            if (k in item) metadata(item[k], path + '.' + k, owner, depth + 1);
        } else if (Array.isArray(value))
          value.forEach((v, i) =>
            metadata(v, path + '[' + i + ']', owner, depth + 1),
          );
        else
          link(
            source,
            owner,
            typeof value === 'string' && /^[1-9]\d*$/.test(value)
              ? Number(value)
              : value,
            path,
            true,
          );
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (Object.hasOwn(metadataIds, k))
            metadata(v, path + '.' + k, metadataIds[k], depth + 1);
          else {
            const knownText = new Set([
              'from',
              'to',
              'reason',
              'note',
              'notes',
              'agency',
              'outcome',
              'previousOutcome',
              'field',
              'oldValue',
              'newValue',
              'officeChanged',
              'fromOffice',
              'toOffice',
              'oldLat',
              'oldLng',
              'newLat',
              'newLng',
              'oldBarangay',
              'newBarangay',
              'distanceM',
              'oldStatus',
              'newStatus',
              'remarks',
              'action',
              'assignedOffice',
              'hasDueDate',
              'format',
              'surface',
              'dateFrom',
              'dateTo',
              'fromDate',
              'toDate',
              'searchApplied',
              'assigneeFiltered',
              'selectionCount',
              'office',
              'status',
            ]);
            if (!knownText.has(k)) issue(source, 'unknown_audit_metadata_key');
            if (v && typeof v === 'object')
              metadata(v, path + '.details', undefined, depth + 1);
          }
        }
      } else if (Array.isArray(value))
        value.forEach((v) =>
          metadata(v, path + '.details', undefined, depth + 1),
        );
      else issue(source, 'unstructured_audit_metadata');
    }
    metadata(row.metadata, 'metadata');
  }
  for (const edge of links) if (edge.audit) audited.add(key(edge.target));
  const matches = new Map<string, string[]>(),
    outsideWindow: Ref[] = [];
  function match(source: Ref, signals: string[]) {
    if (!signals.length) return;
    const date = created(nodes.get(key(source))!);
    if (!date) {
      issue(source, 'candidate_creation_time_unresolved');
      return;
    }
    if (
      (options.from && date < options.from) ||
      (options.to && date >= options.to)
    )
      outsideWindow.push(source);
    else matches.set(key(source), signals);
  }
  for (const table of ['citizens', 'admins'] as const)
    for (const row of snapshot[table]) {
      const email = text(row.email).toLowerCase();
      if (
        /^e2e-[a-z0-9][a-z0-9._+-]*@[^@\s]+$/i.test(email) &&
        !canonical.has(email)
      )
        match(ref(table, row.id), ['e2e_email_prefix']);
    }
  for (const table of ['reports', 'work_orders'] as const)
    for (const row of snapshot[table])
      if (/^E2E(?:[\s:_-]|$)/i.test(text(row.title)))
        match(ref(table, row.id), ['e2e_title_prefix']);
  const candidateReports = new Set(
    snapshot.reports
      .filter((r) => matches.has(key(ref('reports', r.id))))
      .map((r) => r.id),
  );
  const membersByTicket = new Map<number, InventoryRow[]>();
  for (const row of snapshot.reports) {
    const id = Number(row.ticket_id),
      members = membersByTicket.get(id) ?? [];
    members.push(row);
    membersByTicket.set(id, members);
  }
  for (const row of snapshot.tickets) {
    const members = membersByTicket.get(row.id) ?? [];
    if (members.some((r) => candidateReports.has(r.id)))
      match(ref('tickets', row.id), ['contains_candidate_report']);
  }
  // Context follows membership and merges, not unrelated staff activity. Keep
  // candidate matching independent: context records are never promoted by a join.
  const context = new Set(matches.keys()),
    ticketIds = new Set<number>();
  for (const row of snapshot.reports)
    if (
      matches.has(key(ref('reports', row.id))) ||
      matches.has(key(ref('citizens', Number(row.citizen_id))))
    )
      ticketIds.add(Number(row.ticket_id));
  for (const row of snapshot.work_orders)
    if (matches.has(key(ref('work_orders', row.id))))
      ticketIds.add(Number(row.ticket_id));
  for (const row of snapshot.tickets)
    if (matches.has(key(ref('tickets', row.id)))) ticketIds.add(row.id);
  const adjacency = new Map<number, Set<number>>(),
    sourceLinks = new Map<string, InventoryLink[]>();
  function connect(a: number, b: number) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }
  for (const edge of links) {
    const id = key(edge.source),
      group = sourceLinks.get(id) ?? [];
    group.push(edge);
    sourceLinks.set(id, group);
    if (edge.source.table === 'tickets' && edge.target.table === 'tickets')
      connect(edge.source.id, edge.target.id);
  }
  for (const [source, group] of sourceLinks)
    if (source.startsWith('admin_audit_events:')) {
      const ids = new Set<number>();
      for (const edge of group) {
        if (edge.target.table === 'tickets') ids.add(edge.target.id);
        if (edge.target.table === 'reports') {
          const row = nodes.get(key(edge.target)),
            ticket = row && numeric(row.ticket_id);
          if (ticket) ids.add(ticket);
        }
      }
      const first = [...ids][0];
      for (const id of ids) connect(first, id);
    }
  // Bounded traversal handles cyclic and long historical merge/regroup chains.
  const queue = [...ticketIds];
  for (let i = 0; i < queue.length; i++)
    for (const id of adjacency.get(queue[i]) ?? [])
      if (!ticketIds.has(id)) {
        ticketIds.add(id);
        queue.push(id);
      }
  for (const id of ticketIds) context.add(key(ref('tickets', id)));
  for (const row of snapshot.reports)
    if (ticketIds.has(Number(row.ticket_id)))
      context.add(key(ref('reports', row.id)));
  for (const edge of links)
    if (context.has(key(edge.target))) context.add(key(edge.source));
  // Candidate accounts can have references on operational rows beyond membership.
  const relevant = links.filter(
    (e) => context.has(key(e.source)) || context.has(key(e.target)),
  );
  const relevantKeys = new Set([
    ...context,
    ...relevant.flatMap((e) => [key(e.source), key(e.target)]),
  ]);
  const mixed = new Set<number>();
  for (const id of ticketIds)
    if (
      (membersByTicket.get(id) ?? []).some((r) => !candidateReports.has(r.id))
    )
      mixed.add(id);
  const mixedContext = new Set(mixed),
    mixedQueue = [...mixed];
  for (let i = 0; i < mixedQueue.length; i++)
    for (const id of adjacency.get(mixedQueue[i]) ?? [])
      if (!mixedContext.has(id)) {
        mixedContext.add(id);
        mixedQueue.push(id);
      }
  const incidence = new Map<string, InventoryLink[]>();
  for (const edge of relevant)
    for (const id of new Set([key(edge.source), key(edge.target)])) {
      const group = incidence.get(id) ?? [];
      group.push(edge);
      incidence.set(id, group);
    }
  const candidates = [...matches].map(([id, signals]) => {
    const row = nodes.get(id)!;
    const split = id.indexOf(':');
    const entity = ref(
      id.slice(0, split) as InventoryTable,
      Number(id.slice(split + 1)),
    );
    const own = incidence.get(id) ?? [];
    const linkedTicket =
      entity.table === 'tickets' ? entity.id : numeric(row.ticket_id);
    const blockers = ['owner_review_required'];
    if (audited.has(id)) blockers.push('audit_reference_never_delete');
    if (issues.length) blockers.push('unresolved_references_require_review');
    if (linkedTicket && mixedContext.has(linkedTicket))
      blockers.push('mixed_or_outside_window_ticket');
    if (entity.table === 'citizens')
      blockers.push('citizen_deactivation_not_implemented');
    if (entity.table === 'tickets' && row.merged_into_ticket_id != null)
      blockers.push('merged_history');
    if (own.some((e) => !e.audit)) blockers.push('linked_records_retained');
    return {
      entity,
      signals,
      createdAt: created(row),
      status:
        entity.table === 'tickets' || entity.table === 'work_orders'
          ? text(row.status)
          : undefined,
      isActive: entity.table === 'admins' ? row.is_active === true : undefined,
      trackingReference:
        entity.table === 'reports' &&
        /^PRC-\d{4}-\d{6,}$/.test(text(row.tracking_reference))
          ? text(row.tracking_reference)
          : undefined,
      blockers,
      referenceCount: own.length,
    };
  });
  const countByTable: Record<string, number> = {},
    candidateCounts: Record<string, number> = {};
  for (const table of Object.keys(snapshot) as InventoryTable[])
    countByTable[table] = snapshot[table].length;
  for (const c of candidates)
    candidateCounts[c.entity.table] =
      (candidateCounts[c.entity.table] ?? 0) + 1;
  return {
    version: '8c4.inventory.v1',
    mode: 'read-only-review',
    window: { fromInclusive: options.from, toExclusive: options.to },
    policy: [
      'No deletion or cleanup is authorized by this report.',
      'Audit-linked entities and mixed records must be retained.',
      'Unknown historical/free-text references are not proof of absence.',
      'Future reversible cleanup requires an owner-reviewed list and Neon backup branch.',
    ],
    tableCounts: countByTable,
    candidateCounts,
    candidates,
    outsideWindow,
    protectedCanonicalAccounts: [...nodes]
      .filter(
        ([id, r]) =>
          (id.startsWith('admins:') || id.startsWith('citizens:')) &&
          canonical.has(text(r.email).toLowerCase()),
      )
      .map(([id]) => id),
    mixedTicketIds: [...mixed].sort((a, b) => a - b),
    contextEntities: [...relevantKeys].filter((id) => !matches.has(id)).sort(),
    auditProtectedEntities: [...audited]
      .filter((id) => relevantKeys.has(id))
      .sort(),
    references: relevant,
    unresolvedReferences: issues,
    limitations: [
      'Free-text audit/notification/history content is not searched or exported.',
      'Unknown metadata keys and dangling typed references require owner review.',
      'Email/IP-only throttle counters cannot be attributed conclusively and are retained.',
      'Dates restrict primary matches; linked context can be outside that window.',
      'No citizen deactivation, archival schema, deletion or execution mode is implemented.',
    ],
  };
}
