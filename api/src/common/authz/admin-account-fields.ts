import { BadRequestException } from '@nestjs/common';
import type { AdminAccountType } from '../../auth/session.service';
import type { AdminOffice, AdminRole } from '../../admin/admins.service';

export interface AccountFields {
  accountType: AdminAccountType;
  isFocal: boolean;
  office: AdminOffice | null;
}

// Shared by create and update — the API side of the database CHECK
// admins_account_type_office_focal_check (migration 0039), so a bad
// combination is a clear 400 instead of a database error:
//   SYSTEM_ADMIN — no office, never Focal;
//   PERSONNEL    — office MEO or MDRRMO; Focal Personnel only on MDRRMO
//                  (organizationally MDRRMO/QRT — not a free choice).
// isFocal may be left out (= not Focal). There is no "clamp" here (unlike
// ticket/report office scoping) — an invalid combination is always a hard
// rejection. This is the one place the account_type/office/is_focal
// invariant is enforced, per the Batch 1 design: centralize it rather than
// duplicating inconsistent conditionals across create()/update().
export function assertAccountFields(
  accountType: unknown,
  isFocal: unknown,
  office: unknown,
): AccountFields {
  if (accountType !== 'PERSONNEL' && accountType !== 'SYSTEM_ADMIN') {
    throw new BadRequestException(
      'accountType must be PERSONNEL or SYSTEM_ADMIN.',
    );
  }
  if (isFocal !== undefined && typeof isFocal !== 'boolean') {
    throw new BadRequestException('isFocal must be true or false.');
  }
  const focal = isFocal === true;
  if (accountType === 'SYSTEM_ADMIN') {
    if (office !== null && office !== undefined) {
      throw new BadRequestException('A System Administrator has no office.');
    }
    if (focal) {
      throw new BadRequestException(
        'A System Administrator cannot be Focal Personnel.',
      );
    }
    return { accountType, isFocal: false, office: null };
  }
  if (office !== 'MEO' && office !== 'MDRRMO') {
    throw new BadRequestException('Personnel must have office MEO or MDRRMO.');
  }
  if (focal && office !== 'MDRRMO') {
    throw new BadRequestException('Focal Personnel must have office MDRRMO.');
  }
  return { accountType, isFocal: focal, office };
}

// The retained admins.role sync mirror (NOT NULL, never read for
// access): Focal Personnel -> 'focal', System Administrator ->
// 'system_admin', other Personnel keep an existing officer/supervisor value
// (the two had identical permissions), else 'officer'.
export function roleMirror(
  fields: Pick<AccountFields, 'accountType' | 'isFocal'>,
  existingRole?: AdminRole,
): AdminRole {
  if (fields.accountType === 'SYSTEM_ADMIN') return 'system_admin';
  if (fields.isFocal) return 'focal';
  return existingRole === 'officer' || existingRole === 'supervisor'
    ? existingRole
    : 'officer';
}
