"use client";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

export function AdminSidebarTrigger({ place }: { place: "sidebar" | "navbar" }) {
  const isMobile = useIsMobile();
  const { open, openMobile } = useSidebar();
  const sidebarOpen = isMobile ? openMobile : open;

  return (
    <SidebarTrigger
      className={cn(
        "transition-opacity duration-0 motion-reduce:transition-none",
        sidebarOpen && place === "navbar" && "pointer-events-none opacity-0",
        !sidebarOpen && place === "sidebar" && "pointer-events-none opacity-0",
      )}
    />
  );
}
