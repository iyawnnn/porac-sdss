import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/layouts/BrandLogo";
import { Card, CardContent } from "@/components/ui/card";

// Layout from the shadcn `login-04` block: one centered card, form on the left,
// photograph on the right (hidden below md so phones get a single column).
// Shared by every citizen and staff auth page so they read as one product.

type AuthShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted px-4 py-6 md:px-10 md:py-8">
      <div className="w-full max-w-sm md:max-w-[1200px]">
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:mb-4"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Home
        </Link>

        <Card className="overflow-hidden p-0 shadow-sm">
          <CardContent className="grid p-0 md:grid-cols-2 lg:min-h-[clamp(560px,calc(100svh_-_10rem),720px)]">
            <div className="flex flex-col justify-center p-6 md:p-8 lg:p-12">
              <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
                <header className="flex flex-col items-center gap-2 text-center">
                  <BrandLogo height={36} priority className="mb-2" />
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">{title}</h1>
                  <p className="text-balance text-sm text-muted-foreground">{description}</p>
                </header>
                {children}
              </div>
            </div>

            <div className="relative hidden bg-muted md:block">
              {/* Decorative, so no alt text: the page heading already says where you are.
                  CC0, so no credit is needed; provenance is in docs/design-system.md 8.5. */}
              <Image
                src="/images/auth-porac-jalung.jpg"
                alt=""
                fill
                sizes="(min-width: 768px) 1200px, 1px"
                className="object-cover object-[50%_45%] dark:brightness-[0.7]"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
