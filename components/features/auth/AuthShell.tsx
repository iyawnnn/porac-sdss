import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthPhoto } from "@/components/features/auth/AuthPhoto";
import { BrandLogo } from "@/components/layouts/BrandLogo";

// Full-viewport split layout shared by every citizen and staff auth page, and by the
// public home page: the form panel on the left, an edge-to-edge photograph on the right.
// Below md the photo is dropped and the form takes the whole width. No fixed heights, so
// longer forms (create account) scroll naturally.

type AuthShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  /** Hide "Back to Home": the home page itself has nothing to go back to. */
  hideBackLink?: boolean;
};

export function AuthShell({ title, description, children, hideBackLink }: AuthShellProps) {
  return (
    // Spacing tokens read by AuthFields (--auth-gap) and the header below; `compact`
    // (phones, viewports 720px tall or less) tightens all three.
    <main className="grid min-h-dvh bg-background [--auth-gap:1.5rem] [--auth-head-gap:2.25rem] [--auth-logo-gap:1.75rem] md:grid-cols-2 compact:[--auth-gap:1.25rem] compact:[--auth-head-gap:1.75rem] compact:[--auth-logo-gap:1.25rem]">
      {/* Back link top-left, form centered on the panel: the two outer rows share the
          spare height equally, so the form stays centered and nothing overlaps when short. */}
      <div className="grid grid-rows-[1fr_auto_1fr] gap-y-6 px-6 py-6 md:px-8 lg:px-12">
        <div>
          {!hideBackLink && (
            <Link
              href="/"
              className="group inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ArrowLeft
                className="size-4 transition-transform duration-[450ms] ease-[cubic-bezier(0.76,0,0.24,1)] motion-safe:group-focus-visible:-translate-x-[3px] motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover:-translate-x-[3px]"
                aria-hidden="true"
              />
              <span className="link-underline">Back to Home</span>
            </Link>
          )}
        </div>

        <div className="mx-auto w-full max-w-[420px]">
          <header className="mb-(--auth-head-gap) flex flex-col items-center text-center">
            <BrandLogo height={44} priority className="mb-(--auth-logo-gap)" />
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="mt-2 text-balance text-sm text-muted-foreground">{description}</p>
          </header>
          {children}
        </div>
      </div>

      {/* The photo stays pinned to the viewport while a long form scrolls. */}
      <div className="hidden bg-muted md:block">
        <div className="sticky top-0 h-dvh">
          <AuthPhoto />
        </div>
      </div>
    </main>
  );
}
