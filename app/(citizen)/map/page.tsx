import { redirect } from "next/navigation";

// The public map now lives at /dashboard (the citizen landing route);
// keep this path working for existing links/bookmarks.
export default function CitizenPublicMapPage() {
  redirect("/dashboard");
}
