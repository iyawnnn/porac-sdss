import { AuthPhoto } from "@/components/features/auth/AuthPhoto";
import { BrandLogo } from "@/components/layouts/BrandLogo";

// Full-viewport split layout shared by every citizen and staff auth page: the
// form panel on the left, an edge-to-edge photograph on the right. Below md the
// photo is dropped and the form takes the whole width. No fixed heights, so
// longer forms (create account) scroll naturally.

type AuthShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <main className="grid min-h-dvh bg-background md:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-10 md:px-8 lg:px-16">
        <div className="mx-auto flex w-full max-w-[400px] flex-col gap-6">
          <header className="flex flex-col items-center gap-2 text-center">
            <BrandLogo height={36} priority className="mb-2" />
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="text-balance text-sm text-muted-foreground">{description}</p>
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
