import { ForbiddenException } from '@nestjs/common';
import type { AdminSession } from '../../auth/session.service';

// Centralizes office-scope enforcement so every admin endpoint applies the
// same rule instead of each controller/service re-deriving it. See
// PLAN.md-adjacent audit: office scoping used to be a client-suppliable
// default, not a restriction — these helpers make it a hard clamp.
//
// Batch 1 (five-role RBAC) correction: system_admin previously bypassed
// office scoping entirely (city-wide operational access). That bypass is
// removed — System Administrator / MIS is a system/account-administration
// role now, with no routine operational authority at all. `focal` also
// carries an office value (always 'MDRRMO', organizationally) but must not
// inherit MDRRMO's operational access through that — office scoping below
// is granted only to `isOperationalStaff`, never derived from
// `!isSystemAdmin(...)`.

export function isSystemAdmin(admin: Pick<AdminSession, 'role'>): boolean {
  return admin.role === 'system_admin';
}

export function isFocal(admin: Pick<AdminSession, 'role'>): boolean {
  return admin.role === 'focal';
}

// The only two roles with routine operational (Ticket/Work Order/Dashboard/
// Map/Moderation/Reports) authority. Every operational scope/access helper
// below requires this explicitly rather than assuming "not system_admin" —
// see the module docblock for why that assumption broke once `focal` (an
// office-bearing, non-operational role) was introduced.
export function isOperationalStaff(admin: Pick<AdminSession, 'role'>): boolean {
  return admin.role === 'officer' || admin.role === 'supervisor';
}

// Only operational staff (officer/supervisor) get an office scope at all —
// a requested office is silently ignored (clamped to the caller's own),
// not honored and not rejected, since it's not the caller's fault the UI
// still sends one. Anyone else (focal, system_admin) is rejected outright:
// this is defense in depth for a route that should already be behind
// OperationalStaffGuard, not a legitimate access path for either role.
export function resolveOfficeScope(
  admin: Pick<AdminSession, 'role' | 'office'>,
  // Kept for call-site compatibility (every caller still passes the parsed
  // query office through) but no longer consulted: an operational admin is
  // always clamped to their own office now, and no other role reaches this
  // line without throwing first.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  requestedOffice: 'MEO' | 'MDRRMO' | 'all' | undefined,
): 'MEO' | 'MDRRMO' {
  if (!isOperationalStaff(admin) || !admin.office) {
    throw new ForbiddenException('Operational access required.');
  }
  return admin.office;
}

// Guards single-resource access (ticket detail, status change, reassignment,
// report moderation) where there's no "clamp" equivalent — anyone other
// than the resource's own office's operational staff is rejected outright.
export function assertOfficeAccess(
  admin: Pick<AdminSession, 'role' | 'office'>,
  resourceOffice: 'MEO' | 'MDRRMO',
): void {
  if (!isOperationalStaff(admin) || admin.office !== resourceOffice) {
    throw new ForbiddenException(
      "You do not have access to this office's data.",
    );
  }
}
