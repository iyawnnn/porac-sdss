import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { AdminSession } from '../../auth/session.service';
import { TicketGroupingController } from '../../admin/ticket-grouping.controller';
import { TicketCorrectionsController } from '../../admin/ticket-corrections.controller';
import { AdminSessionGuard } from './admin-session.guard';
import { PersonnelGuard } from './personnel.guard';

// Manuscript revision Phase 3, step 3d: Merge / Remove / Regroup is shared by
// operational Personnel and Focal; the System Administrator has no access.

function contextWith(adminSession: Partial<AdminSession> | undefined) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ adminSession }) }),
  } as unknown as ExecutionContext;
}

describe('PersonnelGuard', () => {
  const guard = new PersonnelGuard();

  it.each([
    [
      'MEO Personnel',
      { accountType: 'PERSONNEL', isFocal: false, office: 'MEO' },
    ],
    [
      'MDRRMO Personnel',
      { accountType: 'PERSONNEL', isFocal: false, office: 'MDRRMO' },
    ],
    [
      'Focal Personnel',
      { accountType: 'PERSONNEL', isFocal: true, office: 'MDRRMO' },
    ],
  ] as const)('admits %s', (_label, session) => {
    expect(guard.canActivate(contextWith(session))).toBe(true);
  });

  it('rejects the System Administrator and a missing session', () => {
    expect(() =>
      guard.canActivate(
        contextWith({
          accountType: 'SYSTEM_ADMIN',
          isFocal: false,
          office: null,
        }),
      ),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('guards TicketGroupingController with AdminSessionGuard + PersonnelGuard', () => {
    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, TicketGroupingController) as
        unknown[] | undefined) ?? [];
    expect(guards).toEqual([AdminSessionGuard, PersonnelGuard]);
  });

  // Manuscript revision Phase 3, step 3e: corrections, the same people.
  it('guards TicketCorrectionsController with AdminSessionGuard + PersonnelGuard', () => {
    const guards =
      (Reflect.getMetadata(GUARDS_METADATA, TicketCorrectionsController) as
        unknown[] | undefined) ?? [];
    expect(guards).toEqual([AdminSessionGuard, PersonnelGuard]);
  });
});
