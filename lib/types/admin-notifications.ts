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
