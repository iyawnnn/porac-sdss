import { ForbiddenException } from '@nestjs/common';
import type { Sql } from 'postgres';
import {
  RELATED_CANDIDATES_LIMIT,
  RelatedTicketsService,
} from './related-tickets.service';

// Manuscript revision Phase 3, step 3c. No DB harness here (the same reason
// as the other admin service specs), so the fake SQL records each query's
// text and values: these tests pin what the service decides — the viewed
// ticket's access check, the office filter, the radius handed to
// ST_DWithin, the exclusions, the order and limit, and the response fields.
// The distances themselves are PostGIS's ST_DWithin on geography.

const MEO = {
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MEO',
} as const;
const MDRRMO = {
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MDRRMO',
} as const;
const FOCAL = {
  accountType: 'PERSONNEL',
  isFocal: true,
  office: 'MDRRMO',
} as const;
const SYSTEM_ADMIN = {
  accountType: 'SYSTEM_ADMIN',
  isFocal: false,
  office: null,
} as const;

interface Call {
  text: string;
  values: unknown[];
}

function candidateRow(id: number, distance: number) {
  return {
    id,
    category: 'Pothole / Road Surface Damage',
    status: 'Reported',
    assigned_office: 'MEO',
    barangay_name: 'Pio',
    distance_m: distance,
    member_count: 1,
    first_report_id: id * 10,
    tracking_reference: `PRC-2026-${String(id).padStart(6, '0')}`,
    reported_at: '2026-10-01T00:00:00.000Z',
  };
}

// First query: the viewed ticket (or the report's ticket); second: the
// candidates.
function fakeSql(
  viewed: { id: number; category: string; assigned_office: string } | null,
  candidates: unknown[] = [],
) {
  const calls: Call[] = [];
  const sql = jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('?'), values });
    return Promise.resolve(
      calls.length === 1 ? (viewed ? [viewed] : []) : candidates,
    );
  }) as unknown as Sql;
  return { sql, calls };
}

const POTHOLE = {
  id: 7,
  category: 'Pothole / Road Surface Damage',
  assigned_office: 'MEO',
};

describe('RelatedTicketsService.forTicket (Ticket Detail)', () => {
  it.each([
    ['Pothole / Road Surface Damage', 20],
    ['Streetlight Out', 20],
    ['Clogged Drainage / Damaged Culvert', 50],
    ['Uneven Sidewalk', 50],
    ['Localized Flooding', 100],
    ['Lahar or Volcanic Debris-Flow Threat', 100],
    ['Not A Real Category', 50],
  ])(
    '%s: ST_DWithin on geography gets the %i m radius',
    async (category, radius) => {
      const { sql, calls } = fakeSql({ ...POTHOLE, category });
      const result = await new RelatedTicketsService(sql).forTicket(7, MEO);
      expect(result?.radiusM).toBe(radius);
      const query = calls[1];
      expect(query.text).toContain(
        'ST_DWithin(t.geom::geography, v.geom::geography, ?)',
      );
      // [viewed id, office, office, bbox radius, ST_DWithin radius, limit]
      expect(query.values).toEqual([7, 'MEO', 'MEO', radius + 1, radius, 10]);
    },
  );

  it('matches only the same current category, never the ticket itself', async () => {
    const { sql, calls } = fakeSql(POTHOLE);
    await new RelatedTicketsService(sql).forTicket(7, MEO);
    expect(calls[1].text).toContain(
      'JOIN tickets t ON t.id <> v.id AND t.category = v.category',
    );
  });

  it('excludes merged-away tickets and Resolved / Rejected ones', async () => {
    const { sql, calls } = fakeSql(POTHOLE);
    await new RelatedTicketsService(sql).forTicket(7, MEO);
    expect(calls[1].text).toContain('t.merged_into_ticket_id IS NULL');
    expect(calls[1].text).toContain(
      "t.status IN ('Reported', 'Under Review', 'In Progress')",
    );
  });

  it('lets the GiST index narrow the search with a bounding box 1 m wider than the radius', async () => {
    const { sql, calls } = fakeSql(POTHOLE);
    await new RelatedTicketsService(sql).forTicket(7, MEO);
    expect(calls[1].text).toContain(
      't.geom && ST_Envelope(ST_Buffer(v.geom::geography, ?)::geometry)',
    );
  });

  it('sorts by distance and returns at most 10, in the order the query returns', async () => {
    const rows = [3, 9, 14].map((d, i) => candidateRow(20 + i, d));
    const { sql, calls } = fakeSql(POTHOLE, rows);
    const result = await new RelatedTicketsService(sql).forTicket(7, MEO);
    expect(RELATED_CANDIDATES_LIMIT).toBe(10);
    expect(calls[1].text).toMatch(
      /ORDER BY ST_Distance\(t\.geom::geography, v\.geom::geography\), t\.id\s+LIMIT \?/,
    );
    expect(result?.candidates.map((c) => c.distanceM)).toEqual([3, 9, 14]);
  });

  it('gives MEO Personnel only MEO candidates', async () => {
    const { sql, calls } = fakeSql(POTHOLE);
    await new RelatedTicketsService(sql).forTicket(7, MEO);
    expect(calls[1].text).toContain(
      '(?::text IS NULL OR t.assigned_office = ?::office)',
    );
    expect(calls[1].values.slice(1, 3)).toEqual(['MEO', 'MEO']);
  });

  it('gives MDRRMO Personnel only MDRRMO candidates', async () => {
    const { sql, calls } = fakeSql({ ...POTHOLE, assigned_office: 'MDRRMO' });
    await new RelatedTicketsService(sql).forTicket(7, MDRRMO);
    expect(calls[1].values.slice(1, 3)).toEqual(['MDRRMO', 'MDRRMO']);
  });

  it.each([
    ['MDRRMO Personnel on an MEO ticket', MDRRMO],
    ['Focal Personnel', FOCAL],
    ['the System Administrator', SYSTEM_ADMIN],
  ])(
    'rejects %s like Ticket Detail does (403), before any candidate query',
    async (_label, admin) => {
      const { sql, calls } = fakeSql(POTHOLE);
      await expect(
        new RelatedTicketsService(sql).forTicket(7, admin),
      ).rejects.toThrow(ForbiddenException);
      expect(calls).toHaveLength(1);
    },
  );

  it('returns null for a missing ticket (404), without a candidate query', async () => {
    const { sql, calls } = fakeSql(null);
    await expect(
      new RelatedTicketsService(sql).forTicket(404, MEO),
    ).resolves.toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('returns only the panel fields, never citizen, photo, description or internal data', async () => {
    const { sql, calls } = fakeSql(POTHOLE, [candidateRow(21, 12)]);
    const result = await new RelatedTicketsService(sql).forTicket(7, MEO);
    expect(result?.candidates[0]).toEqual({
      ticketId: 21,
      category: 'Pothole / Road Surface Damage',
      status: 'Reported',
      assignedOffice: 'MEO',
      barangayName: 'Pio',
      distanceM: 12,
      memberCount: 1,
      reportedAt: '2026-10-01T00:00:00.000Z',
      trackingReference: 'PRC-2026-000021',
      firstReportId: 210,
    });
    expect(calls[1].text).not.toMatch(
      /citizen|title|description|image_url|flags|exif|notes|work_orders|operational_assessments|priority/,
    );
  });
});

describe('RelatedTicketsService.forReport (Focal intake)', () => {
  it("uses the report's ticket and returns candidates from both offices", async () => {
    const { sql, calls } = fakeSql(POTHOLE);
    const result = await new RelatedTicketsService(sql).forReport(55, FOCAL);
    expect(result?.radiusM).toBe(20);
    expect(calls[0].text).toContain(
      'FROM reports r JOIN tickets t ON t.id = r.ticket_id',
    );
    expect(calls[0].values).toEqual([55]);
    // No office filter: [viewed id, null, null, bbox radius, radius, limit].
    expect(calls[1].values).toEqual([7, null, null, 21, 20, 10]);
  });

  it.each([
    ['MEO Personnel', MEO],
    ['MDRRMO Personnel', MDRRMO],
    ['the System Administrator', SYSTEM_ADMIN],
  ])('rejects %s (403), as FocalGuard does', async (_label, admin) => {
    const { sql, calls } = fakeSql(POTHOLE);
    await expect(
      new RelatedTicketsService(sql).forReport(55, admin),
    ).rejects.toThrow(ForbiddenException);
    expect(calls).toHaveLength(0);
  });

  it('returns null for a missing report (404)', async () => {
    const { sql } = fakeSql(null);
    await expect(
      new RelatedTicketsService(sql).forReport(404, FOCAL),
    ).resolves.toBeNull();
  });
});

describe('related candidates are read-only', () => {
  it('only ever runs SELECTs', async () => {
    const { sql, calls } = fakeSql(POTHOLE, [candidateRow(21, 12)]);
    const service = new RelatedTicketsService(sql);
    await service.forTicket(7, MEO);
    await service.forReport(55, FOCAL);
    for (const call of calls) {
      expect(call.text.trim()).toMatch(/^SELECT/);
      expect(call.text).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    }
  });
});
