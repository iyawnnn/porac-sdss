import { redirect } from "next/navigation";

// Retained temporarily as a stable internal link after the approved Efferd
// composition was migrated to /admin. It intentionally has no separate shell,
// sample data, or theme provider to keep behavior identical to production.
export default function EfferdPreviewPage() {
  redirect("/admin");
}