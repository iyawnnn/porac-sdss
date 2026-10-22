import { ForbiddenException } from '@nestjs/common';
import {
  assertOfficeAccess,
  isFocalPersonnel,
  isOperationalPersonnel,
  isSystemAdmin,
  resolveOfficeScope,
} from './admin-scope';

// Manuscript revision Phase 2, step 2e: the helpers read account_type /
// office / is_focal. access-parity.spec.ts compares every decision with the
// old role-based logic; this file keeps the per-helper cases.
const MEO_PERSONNEL = {
  accountType: 'PERSONNEL' as const,
  isFocal: false,
  office: 'MEO' as const,
};
const MDRRMO_PERSONNEL = {
  accountType: 'PERSONNEL' as const,
  isFocal: false,
  office: 'MDRRMO' as const,
};
const FOCAL = {
  accountType: 'PERSONNEL' as const,
  isFocal: true,
  office: 'MDRRMO' as const,
};
const SYSTEM_ADMIN = {
  accountType: 'SYSTEM_ADMIN' as const,
  isFocal: false,
  office: null,
};

describe('isSystemAdmin', () => {
  it('is true only for account type SYSTEM_ADMIN', () => {
    expect(isSystemAdmin(SYSTEM_ADMIN)).toBe(true);
    expect(isSystemAdmin(MEO_PERSONNEL)).toBe(false);
    expect(isSystemAdmin(MDRRMO_PERSONNEL)).toBe(false);
    expect(isSystemAdmin(FOCAL)).toBe(false);
  });
});

describe('isFocalPersonnel', () => {
  it('is true only for Personnel with is_focal', () => {
    expect(isFocalPersonnel(FOCAL)).toBe(true);
    expect(isFocalPersonnel(MEO_PERSONNEL)).toBe(false);
    expect(isFocalPersonnel(MDRRMO_PERSONNEL)).toBe(false);
    expect(isFocalPersonnel(SYSTEM_ADMIN)).toBe(false);
  });
});

describe('isOperationalPersonnel', () => {
  it('is true only for Personnel that is not Focal', () => {
    expect(isOperationalPersonnel(MEO_PERSONNEL)).toBe(true);
    expect(isOperationalPersonnel(MDRRMO_PERSONNEL)).toBe(true);
  });

  // The whole point of this helper (Batch 1, five-role RBAC): neither Focal
  // Personnel nor the System Administrator is routine operational staff,
  // even though Focal also carries an office value. Never derive this from
  // the office alone or from `!isSystemAdmin(...)`.
  it('is false for Focal Personnel and the System Administrator', () => {
    expect(isOperationalPersonnel(FOCAL)).toBe(false);
    expect(isOperationalPersonnel(SYSTEM_ADMIN)).toBe(false);
  });
});

describe('resolveOfficeScope', () => {
  it('clamps operational Personnel to their own office regardless of the requested value', () => {
    expect(resolveOfficeScope(MEO_PERSONNEL, undefined)).toBe('MEO');
    expect(resolveOfficeScope(MEO_PERSONNEL, 'all')).toBe('MEO');
    expect(resolveOfficeScope(MEO_PERSONNEL, 'MDRRMO')).toBe('MEO');
    expect(resolveOfficeScope(MDRRMO_PERSONNEL, 'MEO')).toBe('MDRRMO');
  });

  // Batch 1's explicit correction: system_admin no longer gets city-wide
  // (or any) operational office scope — that legacy bypass is removed, not
  // preserved behind a flag. See CLAUDE.md-adjacent Batch 1 design note.
  it('rejects a system admin outright, never widening to city-wide', () => {
    expect(() => resolveOfficeScope(SYSTEM_ADMIN, undefined)).toThrow(
      ForbiddenException,
    );
    expect(() => resolveOfficeScope(SYSTEM_ADMIN, 'MEO')).toThrow(
      ForbiddenException,
    );
  });

  // Focal has an office value (MDRRMO) for organizational/reporting
  // purposes only — it must not inherit MDRRMO's operational office scope
  // through this helper just because admin.office === 'MDRRMO'.
  it('rejects Focal Personnel outright, even though it carries office=MDRRMO', () => {
    expect(() => resolveOfficeScope(FOCAL, undefined)).toThrow(
      ForbiddenException,
    );
    expect(() => resolveOfficeScope(FOCAL, 'MDRRMO')).toThrow(
      ForbiddenException,
    );
  });
});

describe('assertOfficeAccess', () => {
  it('passes for operational Personnel accessing their own office', () => {
    expect(() => assertOfficeAccess(MEO_PERSONNEL, 'MEO')).not.toThrow();
    expect(() => assertOfficeAccess(MDRRMO_PERSONNEL, 'MDRRMO')).not.toThrow();
  });

  it('throws ForbiddenException for operational Personnel accessing another office', () => {
    expect(() => assertOfficeAccess(MEO_PERSONNEL, 'MDRRMO')).toThrow(
      ForbiddenException,
    );
    expect(() => assertOfficeAccess(MDRRMO_PERSONNEL, 'MEO')).toThrow(
      ForbiddenException,
    );
  });

  // Batch 1's explicit correction: system_admin no longer bypasses office
  // access checks.
  it('throws for a system admin, regardless of resource office', () => {
    expect(() => assertOfficeAccess(SYSTEM_ADMIN, 'MEO')).toThrow(
      ForbiddenException,
    );
    expect(() => assertOfficeAccess(SYSTEM_ADMIN, 'MDRRMO')).toThrow(
      ForbiddenException,
    );
  });

  // Focal must not gain MDRRMO operational resource access just because
  // its own office value happens to be MDRRMO.
  it('throws for Focal Personnel against MDRRMO resources, despite office=MDRRMO', () => {
    expect(() => assertOfficeAccess(FOCAL, 'MDRRMO')).toThrow(
      ForbiddenException,
    );
    expect(() => assertOfficeAccess(FOCAL, 'MEO')).toThrow(ForbiddenException);
  });
});
