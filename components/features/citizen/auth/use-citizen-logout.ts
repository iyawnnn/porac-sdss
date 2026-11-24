"use client";

import { useRouter } from "next/navigation";

// Shared by the desktop profile menu and the mobile navigation menu.
export function useCitizenLogout() {
  const router = useRouter();
  return async () => {
    await fetch("/api/citizens/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
}
