// The micro-caps header treatment shared by every admin data table (the
// dashboard's Highest Urgency Actions card and the Ticket Queue). It lived as
// a byte-identical local constant in both files before this — HEAD_CLASS in
// TicketsWorkspace.tsx and HUA_HEAD_CLASS in DashboardClient.tsx — which is
// exactly the "duplicate definition" drift docs/design-system.md §7 bans.
//
// Retuned to 10px/700/+0.09em with the Precision Queue rebuild. The queue's
// header strip sits on --color-surface-subtle rather than on white, and at
// 11px/600 the labels competed with the 13px row text underneath them; the
// tighter, bolder, wider-tracked setting reads as a rule instead. Applied
// here rather than as a queue-local override so the dashboard table keeps
// matching the queue — that shared identity is the whole point of the file.
export const TABLE_HEAD_CLASS = "text-[10px] font-bold tracking-[0.09em] text-muted-foreground uppercase";
