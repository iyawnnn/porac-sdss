// Lets the Notification Center page and the header bell (separate
// component instances, each with their own useNotifications() state) stay
// in sync without a shared store: whichever one marks something read
// broadcasts this event, and every mounted useNotifications() instance
// (bell included) refetches in response. A plain window CustomEvent is
// enough at this scale — no new state-management dependency needed.
export const NOTIFICATIONS_UPDATED_EVENT = "porac:notifications-updated";

export function broadcastNotificationsUpdated(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}
