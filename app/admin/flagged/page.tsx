import { apiGet } from "@/lib/api-client";
import type { ModerationQueueRow, ModerationStats } from "@/lib/admin/moderation";
import { FlaggedWorkspace } from "./FlaggedWorkspace";

export default async function AdminFlaggedPage() {
  const [queue, stats] = await Promise.all([
    apiGet<ModerationQueueRow[]>("/admin/moderation"),
    apiGet<ModerationStats>("/admin/moderation/stats"),
  ]);

  return <FlaggedWorkspace initialQueue={queue} initialStats={stats} />;
}
