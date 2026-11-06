import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Response } from 'express';
import type { AdminSession } from '../auth/session.service';
import { OperationalStaffGuard } from '../common/guards/operational-staff.guard';
import { ReportsController } from './reports.controller';
import type { ReportsService } from './reports.service';

describe('export response boundary', () => {
  it.each([
    'ticketsCsv',
    'flaggedCsv',
    'workOrdersCsv',
    'submittedReportsCsv',
    'operationalAssessmentsCsv',
    'priorityIncidentsCsv',
  ] as const)(
    '%s sends no attachment headers when generation or audit fails',
    async (method) => {
      const service = {
        [method]: jest.fn().mockRejectedValue(new Error('refused')),
      };
      const controller = new ReportsController(
        service as unknown as ReportsService,
      );
      const response = { set: jest.fn() };
      await expect(
        controller[method](
          {},
          {} as AdminSession,
          response as unknown as Response,
        ),
      ).rejects.toThrow('refused');
      expect(response.set).not.toHaveBeenCalled();
    },
  );
  it('retains the operational guard and refuses Focal and System Administrator', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ReportsController)).toContain(
      OperationalStaffGuard,
    );
    for (const session of [
      { accountType: 'PERSONNEL', isFocal: true, office: 'MDRRMO' },
      { accountType: 'SYSTEM_ADMIN', isFocal: false, office: null },
    ]) {
      const context = {
        switchToHttp: () => ({ getRequest: () => ({ adminSession: session }) }),
      } as unknown as ExecutionContext;
      expect(() => new OperationalStaffGuard().canActivate(context)).toThrow(
        ForbiddenException,
      );
    }
  });
});
