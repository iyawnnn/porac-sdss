export interface CitizenNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export const CITIZEN_NOTIFICATION_TYPES = {
  report_received: "Report received",
  report_merged: "Reports tracked together",
  report_acknowledged: "Report acknowledged",
  report_quarantined: "Report under additional review",
  report_flagged_duplicate: "Report matched an existing submission",
  ticket_under_review: "Report under review",
  ticket_in_progress: "Work in progress",
  ticket_resolved: "Report resolved",
  ticket_rejected: "Report not accepted",
  ticket_reassigned: "Report routed",
  ticket_referred: "Report referred",
  ticket_returned_to_review: "Back under review",
  ticket_acknowledged: "Report acknowledged",
  resolution_feedback_received: "Feedback received",
} as const;

export interface NotificationListResponse {
  items: CitizenNotification[];
  nextCursor: number | null;
}
