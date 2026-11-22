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

// Primary action styling (.auth-cta in globals.css). Same-variant classes, so tailwind-merge
// replaces the shared Button's own `hover:bg-primary/80` fade and `active:translate-y-px` press
// shift instead of fighting them: a clear hover shade and a darker pressed shade from the
// --primary-hover / --primary-pressed tokens, no movement, 200ms ease-out. The shared Button
// is unchanged for every other screen.
export const AUTH_CTA =
  "auth-cta hover:bg-primary-hover active:bg-primary-pressed active:not-aria-[haspopup]:translate-y-0 duration-200 ease-out";
export const AUTH_CTA_BUTTON = cn(AUTH_BUTTON, AUTH_CTA);

// The one real, static label, kept above the decorative light layers. A flex row so an icon
// (the loading spinner) sits beside the text and the pair stays centered.
export function AuthCtaLabel({ children }: { children: React.ReactNode }) {
  return <span className="relative inline-flex items-center gap-2">{children}</span>;
}
