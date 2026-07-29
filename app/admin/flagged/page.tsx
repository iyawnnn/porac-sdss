import { getModerationQueue, getModerationStats } from "@/lib/admin/moderation";
import { FlaggedWorkspace } from "./FlaggedWorkspace";

export default async function AdminFlaggedPage() {
  const [queue, stats] = await Promise.all([getModerationQueue(), getModerationStats()]);

  return <FlaggedWorkspace initialQueue={queue} initialStats={stats} />;
}
