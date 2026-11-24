"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    // private mode: the choice just won't persist
  }
}

// Extra props let it sit inside a Radix `asChild` trigger (the citizen header's tooltip).
export function ThemeToggle({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    applyTheme(!document.documentElement.classList.contains("dark"));
  }

  // Both icons render and CSS picks one, so server and client markup match.
  return (
    <Button variant="ghost" size="icon" {...props} className={cn("active:not-aria-[haspopup]:translate-y-0", className)} onClick={toggle} aria-label="Switch between light and dark theme">
      <Sun className="hidden dark:block" aria-hidden="true" />
      <Moon className="dark:hidden" aria-hidden="true" />
    </Button>
  );
}
