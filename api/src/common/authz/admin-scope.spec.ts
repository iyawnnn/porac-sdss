import { ForbiddenException } from '@nestjs/common';
import { assertOfficeAccess, isSystemAdmin, resolveOfficeScope } from './admin-scope';

const MEO_OFFICER = { role: 'officer' as const, office: 'MEO' as const };
const MDRRMO_SUPERVISOR = {
  role: 'supervisor' as const,
  office: 'MDRRMO' as const,
};
const SYSTEM_ADMIN = { role: 'system_admin' as const, office: null };

describe('isSystemAdmin', () => {
  it('is true only for role system_admin', () => {
    expect(isSystemAdmin(SYSTEM_ADMIN)).toBe(true);
    expect(isSystemAdmin(MEO_OFFICER)).toBe(false);
    expect(isSystemAdmin(MDRRMO_SUPERVISOR)).toBe(false);
  });
});

describe('resolveOfficeScope', () => {
  it('clamps a non-system-admin to their own office regardless of the requested value', () => {
    expect(resolveOfficeScope(MEO_OFFICER, undefined)).toBe('MEO');
    expect(resolveOfficeScope(MEO_OFFICER, 'all')).toBe('MEO');
    expect(resolveOfficeScope(MEO_OFFICER, 'MDRRMO')).toBe('MEO');
    expect(resolveOfficeScope(MDRRMO_SUPERVISOR, 'MEO')).toBe('MDRRMO');
  });

  it('defaults a system admin to city-wide (undefined) when no office is requested', () => {
    expect(resolveOfficeScope(SYSTEM_ADMIN, undefined)).toBeUndefined();
    expect(resolveOfficeScope(SYSTEM_ADMIN, 'all')).toBeUndefined();
  });

  it('honors an explicit office request from a system admin', () => {
    expect(resolveOfficeScope(SYSTEM_ADMIN, 'MEO')).toBe('MEO');
    expect(resolveOfficeScope(SYSTEM_ADMIN, 'MDRRMO')).toBe('MDRRMO');
  });
});

describe('assertOfficeAccess', () => {
  it('passes for a non-system-admin accessing their own office', () => {
    expect(() => assertOfficeAccess(MEO_OFFICER, 'MEO')).not.toThrow();
  });

  it('throws ForbiddenException for a non-system-admin accessing another office', () => {
    expect(() => assertOfficeAccess(MEO_OFFICER, 'MDRRMO')).toThrow(
      ForbiddenException,
    );
    expect(() => assertOfficeAccess(MDRRMO_SUPERVISOR, 'MEO')).toThrow(
      ForbiddenException,
    );
  });

  it('never throws for a system admin, regardless of resource office', () => {
    expect(() => assertOfficeAccess(SYSTEM_ADMIN, 'MEO')).not.toThrow();
    expect(() => assertOfficeAccess(SYSTEM_ADMIN, 'MDRRMO')).not.toThrow();
  });
});
