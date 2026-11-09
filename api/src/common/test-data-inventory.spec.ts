import {
  buildInventory,
  INVENTORY_TABLES,
  type InventorySnapshot,
} from '../../scripts/lib/test-data-inventory';
import {
  inventoryOptions,
  inventoryTarget,
  inventoryFailure,
} from '../../scripts/lib/test-data-inventory-options';

const all = inventoryOptions(['--target', 'local', '--all-dates']);
function fixture() {
  const snapshot = Object.fromEntries(
    Object.keys(INVENTORY_TABLES).map((k) => [k, []]),
  ) as unknown as InventorySnapshot;
  snapshot.citizens = [
    {
      id: 1,
      email: 'e2e-own@fixture.invalid',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 2,
      email: 'real@fixture.invalid',
      created_at: '2026-01-01T00:00:00Z',
    },
    { id: 3, email: 'citizen1@porac.ph', created_at: '2026-01-01T00:00:00Z' },
  ];
  snapshot.admins = [
    {
      id: 1,
      email: 'e2e-staff@fixture.invalid',
      created_at: '2026-01-01T00:00:00Z',
    },
  ];
  snapshot.tickets = [
    { id: 1, created_at: '2026-01-01T00:00:00Z' },
    { id: 2, created_at: '2026-01-01T00:00:00Z' },
  ];
  snapshot.reports = [
    {
      id: 1,
      citizen_id: 1,
      ticket_id: 1,
      title: 'E2E isolated report',
      tracking_reference: 'PRC-2026-000001',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 2,
      citizen_id: 2,
      ticket_id: 2,
      title: 'Ordinary report',
      created_at: '2026-01-01T00:00:00Z',
    },
  ];
  return snapshot;
}
describe('test-data inventory safety and matching', () => {
  it.each(['--apply', '--delete', '--reset', '--output', '--unknown'])(
    'rejects %s rather than accepting a mutation/output mode',
    (flag) => {
      expect(() =>
        inventoryOptions(['--target', 'local', '--all-dates', flag]),
      ).toThrow('No mutation mode');
    },
  );
  it.each(
    [
      [],
      ['--target', 'local'],
      ['--target', 'other', '--all-dates'],
      ['--target', 'production', '--all-dates'],
      ['--target', 'copy', '--all-dates', '--confirm-production-read-only'],
      ['--target', 'local', '--all-dates', '--all-dates'],
      ['--target', 'local', '--all-dates', '--from', '2026-01-01T00:00:00Z'],
      [
        '--target',
        'local',
        '--from',
        '2026-02-30T00:00:00Z',
        '--to',
        '2026-04-01T00:00:00Z',
      ],
      ['--target', 'local', '--from', '2026-01-01', '--to', '2026-04-01'],
      [
        '--target',
        'local',
        '--from',
        '2026-01-01T24:00:00Z',
        '--to',
        '2026-04-01T00:00:00Z',
      ],
      [
        '--target',
        'local',
        '--from',
        '2026-02-01T00:00:00Z',
        '--to',
        '2026-01-01T00:00:00Z',
      ],
    ].map((args) => ({ args })),
  )('refuses incomplete or ambiguous scope %#', ({ args }) =>
    expect(() => inventoryOptions(args)).toThrow(),
  );
  it('normalizes explicit timezone offsets and permits the deliberate production read-only scope', () => {
    expect(
      inventoryOptions([
        '--target',
        'local',
        '--from',
        '2026-01-01T08:00:00+08:00',
        '--to',
        '2026-02-01T08:00:00+08:00',
      ]).from,
    ).toBe('2026-01-01T00:00:00.000Z');
    expect(
      inventoryOptions([
        '--target',
        'production',
        '--confirm-production-read-only',
        '--all-dates',
      ]).target,
    ).toBe('production');
  });
  it.each([
    'postgres://test:test@ep-steep-mouse-test.invalid/neondb',
    'postgres://test:test@ep-noisy-leaf-test.invalid/neondb',
    'postgres://test:test@127.0.0.1/db?host=ep-steep-mouse-test.invalid',
    'postgres://test:test@127.0.0.1/db?options=anything',
    'postgres://test:test@127.0.0.1,other/db',
    'file:///tmp/db',
    'not-a-url',
  ])('does not allow local mode to retarget or infer a database %#', (url) => {
    expect(() => inventoryTarget(url, all)).toThrow('Inventory refused');
  });
  it('requires the target category and database to match even with production consent', () => {
    const prod = inventoryOptions([
      '--target',
      'production',
      '--confirm-production-read-only',
      '--all-dates',
    ]);
    expect(
      inventoryTarget(
        'postgres://test:test@ep-steep-mouse-fake.invalid/neondb?sslmode=require',
        prod,
      ),
    ).toBe('ep-steep-mouse');
    expect(() =>
      inventoryTarget(
        'postgres://test:test@ep-noisy-leaf-fake.invalid/neondb',
        prod,
      ),
    ).toThrow();
    expect(() =>
      inventoryTarget(
        'postgres://test:test@ep-steep-mouse-fake.invalid/other',
        prod,
      ),
    ).toThrow();
  });
  it('does not disclose raw connection, SQL or filesystem error details', () => {
    for (const value of [
      Error('postgres://secret:secret@host/db'),
      Error('SQL PRIVATE NOTES'),
      Error('C:/private/secret'),
      Error('Inventory refused: secret'),
    ])
      expect(inventoryFailure(value)).not.toContain('secret');
  });
  it('identifies bounded prefixes without treating ordinary/canonical accounts or embedded E2E text as candidates', () => {
    const s = fixture();
    s.reports.push(
      {
        id: 3,
        title: 'Road near E2E building',
        ticket_id: 2,
        citizen_id: 2,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 4,
        title: 'E2Example ordinary',
        ticket_id: 2,
        citizen_id: 2,
        created_at: '2026-01-01T00:00:00Z',
      },
    );
    const r = buildInventory(s, all);
    expect(r.candidateCounts).toEqual({
      citizens: 1,
      admins: 1,
      reports: 1,
      tickets: 1,
    });
    expect(r.protectedCanonicalAccounts).toContain('citizens:3');
    expect(r.contextEntities).not.toContain('reports:2');
  });
  it('uses inclusive start/exclusive end while retaining out-of-window linked context', () => {
    const s = fixture();
    s.reports.push({
      ...s.reports[0],
      id: 3,
      created_at: '2026-02-01T00:00:00Z',
    });
    s.reports.push({
      ...s.reports[0],
      id: 4,
      created_at: '2025-12-31T23:59:59Z',
    });
    const r = buildInventory(s, {
      ...all,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    });
    expect(
      r.candidates
        .filter((c) => c.entity.table === 'reports')
        .map((c) => c.entity.id),
    ).toEqual([1]);
    expect(r.outsideWindow).toEqual(
      expect.arrayContaining([
        { table: 'reports', id: 3 },
        { table: 'reports', id: 4 },
      ]),
    );
    expect(r.contextEntities).toEqual(
      expect.arrayContaining(['reports:3', 'reports:4']),
    );
    expect(
      r.candidates.find((c) => c.entity.table === 'reports')?.blockers,
    ).toContain('mixed_or_outside_window_ticket');
  });
  it('uses typed audit IDs, numeric strings and assignment from/to values without cross-namespace matches', () => {
    const s = fixture();
    s.admin_audit_events = [
      {
        id: 1,
        actor_admin_id: 1,
        target_type: 'export',
        target_id: 1,
        action_type: 'report_exported',
        metadata: {
          selectionCount: 2,
          assignedAdminId: { from: '1', to: null },
          nested: { ticketId: 2 },
          reason: 'report 1',
        },
      },
    ];
    const r = buildInventory(s, all);
    expect(r.auditProtectedEntities).toContain('admins:1');
    expect(r.auditProtectedEntities).not.toContain('reports:1');
    expect(r.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: { table: 'tickets', id: 2 },
          via: 'metadata.details.ticketId',
          audit: true,
        }),
      ]),
    );
  });
  it('protects mixed members reached through old merge/regroup metadata and keeps context separate from candidates', () => {
    const s = fixture();
    s.admin_audit_events = [
      {
        id: 1,
        actor_admin_id: 1,
        target_type: 'report',
        target_id: 1,
        action_type: 'report_regrouped',
        metadata: { fromTicketId: 2, toTicketId: 1, movedReportIds: [1] },
      },
    ];
    s.tickets.push({
      id: 3,
      created_at: '2026-01-01T00:00:00Z',
      merged_into_ticket_id: 2,
    });
    const r = buildInventory(s, all);
    expect(r.contextEntities).toEqual(
      expect.arrayContaining(['tickets:2', 'tickets:3', 'reports:2']),
    );
    expect(
      r.candidates.some(
        (c) => c.entity.table === 'reports' && c.entity.id === 2,
      ),
    ).toBe(false);
    expect(
      r.candidates.find((c) => c.entity.table === 'reports')?.blockers,
    ).toEqual(
      expect.arrayContaining([
        'audit_reference_never_delete',
        'mixed_or_outside_window_ticket',
      ]),
    );
  });
  it('finds both typed notification entity and href when a Work Order notification links to its ticket', () => {
    const s = fixture();
    s.work_orders = [
      {
        id: 3,
        ticket_id: 1,
        title: 'E2E Work Order',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    s.notifications = [
      {
        id: 1,
        recipient_type: 'citizen',
        recipient_id: 1,
        entity_type: 'work_order',
        entity_id: 3,
        href: '/admin/tickets/1',
      },
    ];
    const r = buildInventory(s, all),
      edges = r.references.filter((e) => e.source.table === 'notifications');
    expect(edges.map((e) => e.target)).toEqual(
      expect.arrayContaining([
        { table: 'citizens', id: 1 },
        { table: 'work_orders', id: 3 },
        { table: 'tickets', id: 1 },
      ]),
    );
  });
  it('does not cast legacy identities or silently certify unknown audit/notification references', () => {
    const s = fixture();
    s.verifications = [
      { id: 1, ticket_id: 1, citizen_id: 'oauth:abc' },
      { id: 2, ticket_id: 1, citizen_id: '1' },
    ];
    s.admin_audit_events = [
      {
        id: 1,
        actor_admin_id: 999,
        target_type: '__proto__',
        target_id: 1,
        action_type: 'old_unknown',
        metadata: {
          futureEntityId: 1,
          ticketId: 'bad',
          nested: { reportId: 888 },
        },
      },
    ];
    s.notifications = [
      {
        id: 1,
        recipient_type: 'citizen',
        recipient_id: 1,
        entity_type: 'toString',
        entity_id: 1,
        href: '/unknown/1',
      },
    ];
    const r = buildInventory(s, all);
    expect(r.unresolvedReferences.map((i) => i.reason)).toEqual(
      expect.arrayContaining([
        'legacy_verification_identity_unresolved',
        'unknown_audit_action',
        'unknown_audit_target',
        'referenced_row_missing',
        'unknown_audit_metadata_key',
        'unresolved_typed_id',
        'unknown_notification_entity',
        'notification_link_not_resolved',
      ]),
    );
    expect(
      r.references.some(
        (e) => e.via === 'citizen_id_text' && e.target.id === 1,
      ),
    ).toBe(true);
  });
  it('never exports private row contents or arbitrary unknown metadata keys/values', () => {
    const s = fixture();
    s.citizens[0].password_hash = 'PRIVATE_HASH';
    s.reports[0].description = 'PRIVATE_DESCRIPTION';
    s.notifications = [
      {
        id: 1,
        recipient_type: 'citizen',
        recipient_id: 1,
        message: 'PRIVATE_MESSAGE',
        href: 'https://example.invalid/PRIVATE_TOKEN',
      },
    ];
    s.admin_audit_events = [
      {
        id: 1,
        actor_admin_id: 1,
        target_type: 'report',
        target_id: 1,
        action_type: 'report_moderated',
        metadata: { PRIVATE_KEY: 'PRIVATE_VALUE', reason: 'PRIVATE_REASON' },
        actor_email: 'PRIVATE_EMAIL',
      },
    ];
    const output = JSON.stringify(buildInventory(s, all));
    expect(output).not.toContain('PRIVATE_');
    expect(output).not.toContain('e2e-own@');
    expect(output).not.toMatch(/safe.to.delete|applyCommand/i);
  });
  it('terminates cyclic merge traversal and reports missing creation time rather than guessing', () => {
    const s = fixture();
    s.tickets[0].merged_into_ticket_id = 2;
    s.tickets[1].merged_into_ticket_id = 1;
    s.reports.push({
      id: 5,
      title: 'E2E missing date',
      ticket_id: 1,
      citizen_id: 1,
    });
    const r = buildInventory(s, all);
    expect(r.unresolvedReferences).toContainEqual({
      source: { table: 'reports', id: 5 },
      reason: 'candidate_creation_time_unresolved',
    });
    expect(r.contextEntities).toContain('tickets:2');
  });
  it('limits deeply nested metadata and identifies a missing typed target explicitly', () => {
    const s = fixture();
    let metadata: Record<string, unknown> = { reportId: 888 };
    for (let i = 0; i < 15; i++) metadata = { nested: metadata };
    s.admin_audit_events = [
      {
        id: 1,
        actor_admin_id: 1,
        target_type: 'report',
        target_id: 999,
        action_type: 'report_moderated',
        metadata,
      },
    ];
    const r = buildInventory(s, all);
    expect(r.unresolvedReferences.map((i) => i.reason)).toContain(
      'audit_metadata_depth_limit',
    );
    expect(r.references).toContainEqual(
      expect.objectContaining({
        target: { table: 'reports', id: 999 },
        targetExists: false,
      }),
    );
  });
});
