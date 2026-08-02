"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { AdminSession } from "@/lib/auth/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function initials(name: string): string {
  const names = name.trim().split(/\s+/);
  return `${names[0]?.[0] ?? ""}${names.at(-1)?.[0] ?? ""}`.toUpperCase() || "?";
}

export function AdminUserMenu({ session }: { session: AdminSession }) {
  const router = useRouter();
  async function handleSignOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Open administrator menu" asChild>
        <button className="cursor-pointer rounded-full focus-visible:outline-none" type="button"><Avatar className="size-8"><AvatarFallback>{initials(session.adminName)}</AvatarFallback></Avatar></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-3">
          <Avatar className="size-10"><AvatarFallback>{initials(session.adminName)}</AvatarFallback></Avatar>
          <span className="min-w-0"><span className="block truncate font-medium text-foreground">{session.adminName}</span><span className="block truncate text-xs font-normal text-muted-foreground">{session.email}</span><span className="block text-xs font-normal text-muted-foreground">{session.office} {"\u00b7"} {session.role}</span></span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup><DropdownMenuItem className="cursor-pointer" onClick={handleSignOut} variant="destructive"><LogOut />Sign out</DropdownMenuItem></DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
