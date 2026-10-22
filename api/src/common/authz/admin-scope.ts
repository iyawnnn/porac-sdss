import { ForbiddenException } from '@nestjs/common';
import type { AdminSession } from '../../auth/session.service';

// Centralizes office-scope enforcement so every admin endpoint applies the
// same rule instead of each controller/service re-deriving it. See
// PLAN.md-adjacent audit: office scoping used to be a client-suppliable
// default, not a restriction — these helpers make it a hard clamp.
//
// Batch 1 (five-role RBAC) correction: the System Administrator previously
// bypassed office scoping entirely (city-wide operational access). That
// bypass is removed — the System Administrator is account administration
// only now, with no routine operational authority at all. Focal Personnel
// also carries an office value (always 'MDRRMO') but must not inherit
// MDRRMO's operational access through that — office scoping below is
// granted only to `isOperationalPersonnel`, never derived from the office
// alone or from `!isSystemAdmin(...)`.
//
// Manuscript revision Phase 2, step 2e: every decision here reads the
// Appendix H account_type / office / is_focal (the session's accountType /
// office / isFocal), never admins.role, which is now only a sync mirror.
// The old officer and supervisor had identical permissions everywhere and
// are both plain Personnel. lib/utils/adminScope.ts has the same helpers,
// with the same names, for UI gating.

export function isSystemAdmin(
  admin: Pick<AdminSession, 'accountType'>,
): boolean {
  return admin.accountType === 'SYSTEM_ADMIN';
}

// Focal Personnel: intake/screening only (FocalGuard). No Work Orders, no
// assessments, and no MDRRMO operational queue or office scope, even though
// its office is MDRRMO.
export function isFocalPersonnel(
  admin: Pick<AdminSession, 'accountType' | 'isFocal'>,
): boolean {
  return admin.accountType === 'PERSONNEL' && admin.isFocal === true;
}

// The only accounts with routine operational (Ticket/Work Order/Dashboard/
// Map/Moderation/Reports) authority, office-scoped. Every operational
// scope/access helper below requires this explicitly rather than assuming
// "not a System Administrator" — see the module docblock for why that
// assumption broke once Focal (office-bearing, non-operational) existed.
export function isOperationalPersonnel(
  admin: Pick<AdminSession, 'accountType' | 'isFocal'>,
): boolean {
  return admin.accountType === 'PERSONNEL' && admin.isFocal === false;
}

// Only operational Personnel get an office scope at all — a requested
// office is silently ignored (clamped to the caller's own), not honored and
// not rejected, since it's not the caller's fault the UI still sends one.
// Anyone else (Focal Personnel, the System Administrator) is rejected
// outright: this is defense in depth for a route that should already be
// behind OperationalStaffGuard, not a legitimate access path for either.
export function resolveOfficeScope(
  admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>,
  // Kept for call-site compatibility (every caller still passes the parsed
  // query office through) but no longer consulted: an operational admin is
  // always clamped to their own office now, and no other account reaches
  // this line without throwing first.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  requestedOffice: 'MEO' | 'MDRRMO' | 'all' | undefined,
): 'MEO' | 'MDRRMO' {
  if (!isOperationalPersonnel(admin) || !admin.office) {
    throw new ForbiddenException('Operational access required.');
  }
  return admin.office;
}

// Guards single-resource access (ticket detail, status change, reassignment,
// report moderation) where there's no "clamp" equivalent — anyone other
// than the resource's own office's operational Personnel is rejected
// outright (an MDRRMO Focal account included).
export function assertOfficeAccess(
  admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>,
  resourceOffice: 'MEO' | 'MDRRMO',
): void {
  if (!isOperationalPersonnel(admin) || admin.office !== resourceOffice) {
    throw new ForbiddenException(
      "You do not have access to this office's data.",
    );
  }
}
