"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string } = {}) {
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
    } catch {
      // private mode: the choice just won't persist
    }
  }

  // Both icons render and CSS picks one, so server and client markup match.
  return (
    <Button variant="ghost" size="icon" className={cn("active:not-aria-[haspopup]:translate-y-0", className)} onClick={toggle} aria-label="Switch between light and dark theme">
      <Sun className="hidden dark:block" aria-hidden="true" />
      <Moon className="dark:hidden" aria-hidden="true" />
    </Button>
  );
}
