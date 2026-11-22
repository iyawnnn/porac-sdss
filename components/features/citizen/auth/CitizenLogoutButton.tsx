"use client";

import { useRouter } from "next/navigation";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export default function CitizenLogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/citizens/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenuItem className="min-h-11" onSelect={() => void handleLogout()}>
      Sign Out
    </DropdownMenuItem>
  );
}
