export interface AdminNotification {
  id: number;
  recipientType: "admin" | "citizen";
  recipientId: number | null;
  recipientOffice: "MEO" | "MDRRMO" | null;
  type: string;
  title: string;
  message: string;
  href: string | null;
  entityType: string | null;
  entityId: number | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: AdminNotification[];
  nextCursor: number | null;
}

// The only `type` values NotificationsService ever creates for an admin
// recipient (api/src/notifications/notifications.service.ts call sites in
// reports.service.ts, moderation.service.ts, work-orders.service.ts,
// domain/recompute.service.ts) — a client-side allowlist for the type
// filter, not a backend constraint (the API accepts any string).
export const ADMIN_NOTIFICATION_TYPES = [
  "new_citizen_report",
  "ticket_critical",
  "work_order_assigned",
  "work_order_created",
] as const;
export type AdminNotificationType = (typeof ADMIN_NOTIFICATION_TYPES)[number];

export const ADMIN_NOTIFICATION_TYPE_LABELS: Record<AdminNotificationType, string> = {
  new_citizen_report: "New Citizen Report",
  ticket_critical: "Ticket Became Critical",
  work_order_assigned: "Work Order Assigned",
  work_order_created: "Work Order Created",
};
