export function relativeAge(createdAt: string, status: string): string {
  if (status === "Resolved" || status === "Rejected") return "closed";
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return "under an hour ago";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
