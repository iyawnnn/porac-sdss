import { apiGet } from "@/lib/api-client";
import type { ModerationQueueRow, ModerationStats } from "@/lib/types/admin-moderation";
import { FlaggedWorkspace } from "@/components/features/admin/flagged/FlaggedWorkspace";

export default async function AdminFlaggedPage() {
  const [queue, stats] = await Promise.all([
    apiGet<ModerationQueueRow[]>("/admin/moderation"),
    apiGet<ModerationStats>("/admin/moderation/stats"),
  ]);

  return <FlaggedWorkspace initialQueue={queue} initialStats={stats} />;
}
