import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Sql } from 'postgres';
import type { AdminSession } from '../auth/session.service';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { FocalGuard } from '../common/guards/focal.guard';
import { FocalDashboardController } from './focal-dashboard.controller';
import {
  FocalDashboardService,
  parseFocalPage,
} from './focal-dashboard.service';

const focal: AdminSession = {
  adminId: 1,
  adminName: 'Focal',
  email: 'focal@example.test',
  accountType: 'PERSONNEL',
  isFocal: true,
  office: 'MDRRMO',
};

describe('Focal dashboard paging', () => {
  it('defaults to six reports and accepts the maximum size', () => {
    expect(parseFocalPage()).toEqual({ page: 1, pageSize: 6 });
    expect(parseFocalPage('2', '50')).toEqual({ page: 2, pageSize: 50 });
  });
  it.each(['0', '-1', '1.5', 'NaN', '', '1e2', '9007199254740992'])(
    'rejects invalid paging %s',
    (value) => {
      expect(() => parseFocalPage(value)).toThrow(BadRequestException);
      expect(() => parseFocalPage('1', value)).toThrow(BadRequestException);
    },
  );
  it('rejects sizes and pages beyond their bounds', () => {
    expect(() => parseFocalPage('1', '51')).toThrow(BadRequestException);
    expect(() => parseFocalPage('1000001')).toThrow(BadRequestException);
  });
});

describe('Focal dashboard contract', () => {
  it('requires session and Focal guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, FocalDashboardController),
    ).toEqual([AdminSessionGuard, FocalGuard]);
  });
  it.each([
    { ...focal, isFocal: false },
    { ...focal, accountType: 'SYSTEM_ADMIN' as const, office: null },
  ])('refuses non-Focal callers before querying', async (admin) => {
    const query = jest.fn();
    const service = new FocalDashboardService(query as unknown as Sql);
    await expect(service.counts(admin)).rejects.toThrow(ForbiddenException);
    await expect(service.reports(admin)).rejects.toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });
  it.each([null, 0, 2.5])(
    'retains count units and nullable median %s',
    async (median) => {
      const row = {
        newReports: 12,
        unacknowledged: 4,
        needsScreening: 8,
        forwardedOrEscalated: 1,
        medianAcknowledgmentHours30d: median,
      };
      const query = jest
        .fn()
        .mockReturnValueOnce('facts')
        .mockResolvedValueOnce([row]);
      const result = await new FocalDashboardService(
        query as unknown as Sql,
      ).counts(focal);
      expect(result).toEqual(row);
      const calls = query.mock.calls as [TemplateStringsArray, ...unknown[]][];
      const text = calls[1][0].join('?');
      expect(text).toContain('percentile_cont(0.5)');
      expect(text).toContain('FROM acknowledgments a JOIN tickets t');
      expect(text).toContain('a.acknowledged_at >= t.created_at');
      expect(text).toContain('t.created_at IS NOT NULL');
      expect(text).not.toContain('acknowledged_at-submitted_at');
      expect(text).toContain("acknowledged_at >= now()-interval '30 days'");
      expect(text).toContain('acknowledged_at <= now()');
      expect(text).not.toMatch(/work_orders|assigned_admin|notes/);
      const facts = calls[0][0].join('?');
      expect(facts).toContain('t.merged_into_ticket_id IS NULL');
      expect(facts).not.toMatch(/assigned_office\s*=|work_orders/);
    },
  );
  it('retains totals for empty pages and uses stable server ordering and offsets', async () => {
    const query = jest
      .fn()
      .mockReturnValueOnce('facts')
      .mockResolvedValueOnce([{ total: 12, items: [] }]);
    const result = await new FocalDashboardService(
      query as unknown as Sql,
    ).reports(focal, '3', '6');
    expect(result).toEqual({ total: 12, items: [], page: 3, pageSize: 6 });
    const call = query.mock.calls[1] as [TemplateStringsArray, ...unknown[]];
    expect(call[0].join('?')).toContain(
      'ORDER BY submitted_at DESC,report_id DESC',
    );
    expect(call.slice(2)).toEqual([6, 12]);
  });
});
