"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-slate-400 transition-colors hover:bg-slate-800/40 hover:text-slate-200"
    >
      <LogOut size={18} strokeWidth={1.75} className="flex-shrink-0" />
      Sign out
    </button>
  );
}
