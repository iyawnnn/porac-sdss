import { ForbiddenException } from '@nestjs/common';
import {
  assertOfficeAccess,
  isFocal,
  isOperationalStaff,
  isSystemAdmin,
  resolveOfficeScope,
} from './admin-scope';

const MEO_OFFICER = { role: 'officer' as const, office: 'MEO' as const };
const MDRRMO_SUPERVISOR = {
  role: 'supervisor' as const,
  office: 'MDRRMO' as const,
};
const FOCAL = { role: 'focal' as const, office: 'MDRRMO' as const };
const SYSTEM_ADMIN = { role: 'system_admin' as const, office: null };

describe('isSystemAdmin', () => {
  it('is true only for role system_admin', () => {
    expect(isSystemAdmin(SYSTEM_ADMIN)).toBe(true);
    expect(isSystemAdmin(MEO_OFFICER)).toBe(false);
    expect(isSystemAdmin(MDRRMO_SUPERVISOR)).toBe(false);
    expect(isSystemAdmin(FOCAL)).toBe(false);
  });
});

describe('isFocal', () => {
  it('is true only for role focal', () => {
    expect(isFocal(FOCAL)).toBe(true);
    expect(isFocal(MEO_OFFICER)).toBe(false);
    expect(isFocal(MDRRMO_SUPERVISOR)).toBe(false);
    expect(isFocal(SYSTEM_ADMIN)).toBe(false);
  });
});

describe('isOperationalStaff', () => {
  it('is true only for officer or supervisor', () => {
    expect(isOperationalStaff(MEO_OFFICER)).toBe(true);
    expect(isOperationalStaff(MDRRMO_SUPERVISOR)).toBe(true);
  });

  // The whole point of this helper (Batch 1, five-role RBAC): neither focal
  // nor system_admin is routine operational staff, even though focal also
  // carries an office value. Never derive this from `!isSystemAdmin(...)`.
  it('is false for focal and system_admin', () => {
    expect(isOperationalStaff(FOCAL)).toBe(false);
    expect(isOperationalStaff(SYSTEM_ADMIN)).toBe(false);
  });
});

describe('resolveOfficeScope', () => {
  it('clamps an officer/supervisor to their own office regardless of the requested value', () => {
    expect(resolveOfficeScope(MEO_OFFICER, undefined)).toBe('MEO');
    expect(resolveOfficeScope(MEO_OFFICER, 'all')).toBe('MEO');
    expect(resolveOfficeScope(MEO_OFFICER, 'MDRRMO')).toBe('MEO');
    expect(resolveOfficeScope(MDRRMO_SUPERVISOR, 'MEO')).toBe('MDRRMO');
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
  it('rejects focal outright, even though it carries office=MDRRMO', () => {
    expect(() => resolveOfficeScope(FOCAL, undefined)).toThrow(
      ForbiddenException,
    );
    expect(() => resolveOfficeScope(FOCAL, 'MDRRMO')).toThrow(
      ForbiddenException,
    );
  });
});

describe('assertOfficeAccess', () => {
  it('passes for officer/supervisor accessing their own office', () => {
    expect(() => assertOfficeAccess(MEO_OFFICER, 'MEO')).not.toThrow();
    expect(() => assertOfficeAccess(MDRRMO_SUPERVISOR, 'MDRRMO')).not.toThrow();
  });

  it('throws ForbiddenException for officer/supervisor accessing another office', () => {
    expect(() => assertOfficeAccess(MEO_OFFICER, 'MDRRMO')).toThrow(
      ForbiddenException,
    );
    expect(() => assertOfficeAccess(MDRRMO_SUPERVISOR, 'MEO')).toThrow(
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
  it('throws for focal against MDRRMO resources, despite office=MDRRMO', () => {
    expect(() => assertOfficeAccess(FOCAL, 'MDRRMO')).toThrow(
      ForbiddenException,
    );
    expect(() => assertOfficeAccess(FOCAL, 'MEO')).toThrow(ForbiddenException);
  });
});
