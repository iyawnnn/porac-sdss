"use client";

import { useRouter } from "next/navigation";

export default function CitizenLogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/citizens/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="h-9 rounded-md border border-line-200 px-3 text-sm font-medium text-ink-700 hover:bg-line-100"
    >
      Logout
    </button>
  );
}
