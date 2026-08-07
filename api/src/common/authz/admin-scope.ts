import { ForbiddenException } from '@nestjs/common';
import type { AdminSession } from '../../auth/session.service';

// Centralizes office-scope enforcement so every admin endpoint applies the
// same rule instead of each controller/service re-deriving it. See
// PLAN.md-adjacent audit: office scoping used to be a client-suppliable
// default, not a restriction — these helpers make it a hard clamp.

export function isSystemAdmin(admin: Pick<AdminSession, 'role'>): boolean {
  return admin.role === 'system_admin';
}

// Non-system-admins always get their own office — a requested office is
// silently ignored (clamped), not honored and not rejected, since it's not
// the caller's fault the UI still sends one. System admins get city-wide
// (undefined) unless they explicitly ask for one office.
export function resolveOfficeScope(
  admin: Pick<AdminSession, 'role' | 'office'>,
  requestedOffice: 'MEO' | 'MDRRMO' | 'all' | undefined,
): 'MEO' | 'MDRRMO' | undefined {
  if (!isSystemAdmin(admin)) return admin.office ?? undefined;
  return requestedOffice === 'MEO' || requestedOffice === 'MDRRMO'
    ? requestedOffice
    : undefined;
}

// Guards single-resource access (ticket detail, status change, reassignment,
// report moderation) where there's no "clamp" equivalent — a non-system-admin
// acting on another office's resource is rejected outright.
export function assertOfficeAccess(
  admin: Pick<AdminSession, 'role' | 'office'>,
  resourceOffice: 'MEO' | 'MDRRMO',
): void {
  if (isSystemAdmin(admin)) return;
  if (admin.office !== resourceOffice) {
    throw new ForbiddenException(
      "You do not have access to this office's data.",
    );
  }
}
