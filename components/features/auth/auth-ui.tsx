import Link from "next/link";
import { cn } from "@/lib/utils";

// Server-safe building blocks for the auth pages (no hooks, so no "use client"): the home
// page is a server component and cannot read plain values exported from a client module.

// 40px controls and 16px text keep the forms comfortable on a phone (and stop iOS
// zooming on focus). Applied to every auth input and button via these constants.
export const AUTH_INPUT = "h-10 text-base md:text-base";
export const AUTH_BUTTON = "h-10 w-full text-base";
// Vertical rhythm between the fields and actions of a form. The value comes from
// the --auth-gap variable that AuthShell sets (roomier on desktop, tighter on phones).
export const AUTH_GROUP = "gap-(--auth-gap)";

// Text link with the shared underline that draws in on hover and keyboard focus
// (.link-underline in globals.css). Weight, not just color, separates it from the muted
// sentence around it, since there is no resting underline. Color never changes on hover.
export function AuthLink({ className, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={cn(
        "link-underline rounded-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    />
  );
}

// A centered line of muted text that holds a link ("Don't have an account? ...").
export function AuthNote({ children }: { children: React.ReactNode }) {
  return <p className="text-center text-sm text-muted-foreground">{children}</p>;
}

// Primary action styling (.auth-cta in globals.css). The overrides keep the shared Button's
// hover fade and press shift from moving or recoloring the button.
export const AUTH_CTA = "auth-cta hover:bg-primary active:not-aria-[haspopup]:translate-y-0";
export const AUTH_CTA_BUTTON = cn(AUTH_BUTTON, AUTH_CTA);

// The one real, static label, kept above the decorative light layers.
export function AuthCtaLabel({ children }: { children: React.ReactNode }) {
  return <span className="relative">{children}</span>;
}
