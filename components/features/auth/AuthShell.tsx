import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthPhoto } from "@/components/features/auth/AuthPhoto";
import { BrandLogo } from "@/components/layouts/BrandLogo";

// Full-viewport split layout shared by every citizen and staff auth page: the
// form panel on the left, an edge-to-edge photograph on the right. Below md the
// photo is dropped and the form takes the whole width. No fixed heights, so
// longer forms (create account) scroll naturally.

// Where "Back to Home" goes. `/` currently redirects to /login and every other
// citizen page needs an account, so there is no public page to link to yet and the
// link stays hidden rather than pointing back at the page you are on. Set this to the
// public landing route once one exists and the link appears on every auth page.
const PUBLIC_HOME_HREF = null as string | null;

type AuthShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    // Spacing tokens read by AuthFields (--auth-gap) and the header below; `compact`
    // (phones, viewports 720px tall or less) tightens all three.
    <main className="grid min-h-dvh bg-background [--auth-gap:1.5rem] [--auth-head-gap:2.25rem] [--auth-logo-gap:1.75rem] md:grid-cols-2 compact:[--auth-gap:1.25rem] compact:[--auth-head-gap:1.75rem] compact:[--auth-logo-gap:1.25rem]">
      {/* Back link top-left, form centered on the panel: the two outer rows share the
          spare height equally, so the form stays centered and nothing overlaps when short. */}
      <div className="grid grid-rows-[1fr_auto_1fr] gap-y-6 px-6 py-6 md:px-8 lg:px-12">
        <div>
          {PUBLIC_HOME_HREF && (
            <Link
              href={PUBLIC_HOME_HREF}
              className="group inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
            >
              <ArrowLeft
                className="size-4 transition-transform duration-200 motion-safe:group-hover:-translate-x-0.5 motion-safe:group-focus-visible:-translate-x-0.5"
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
