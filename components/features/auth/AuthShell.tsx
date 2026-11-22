import Image from "next/image";
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
    <main className="flex min-h-svh items-center justify-center bg-muted p-4 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <Card className="overflow-hidden p-0 shadow-sm">
          <CardContent className="grid p-0 md:grid-cols-2">
            <div className="flex flex-col gap-6 p-6 md:p-8">
              <header className="flex flex-col items-center gap-2 text-center">
                <BrandLogo height={36} priority className="mb-2" />
                <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">{title}</h1>
                <p className="text-balance text-sm text-muted-foreground">{description}</p>
              </header>
              {children}
            </div>

            <div className="relative hidden bg-muted md:block">
              {/* CC0 photograph of Jalung, Porac (docs/design-system.md 8.5). Decorative,
                  so no alt text: the page heading already says where you are. */}
              <Image
                src="/images/auth-porac-jalung.jpg"
                alt=""
                fill
                sizes="(min-width: 768px) 1080px, 1px"
                className="object-cover object-[40%_50%] dark:brightness-[0.6]"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
