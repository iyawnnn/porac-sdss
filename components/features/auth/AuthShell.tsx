import Image from "next/image";
import { ShieldCheck, UsersRound } from "lucide-react";
import { BrandLogo } from "@/components/layouts/BrandLogo";
import { Card, CardContent } from "@/components/ui/card";
import { MUNICIPALITY } from "@/lib/municipality-config";

// Layout adapted from the shadcn `login-04` block: one centered card, form on
// the left, photograph on the right (hidden below md so phones get one column).
// Shared by every citizen and staff auth page so they read as one product; the
// portal chip is what tells the two audiences apart.

const PORTALS = {
  citizen: { label: "Citizen Portal", Icon: UsersRound, caption: MUNICIPALITY.name },
  staff: { label: "Staff Portal", Icon: ShieldCheck, caption: "Municipal operations portal" },
} as const;

type AuthShellProps = {
  portal: keyof typeof PORTALS;
  title: string;
  description: string;
  /** Extra line under the description, e.g. who the portal is for. */
  audience?: string;
  children: React.ReactNode;
  /** Sits under the card, e.g. the link to the other portal. */
  footer?: React.ReactNode;
};

export function AuthShell({ portal, title, description, audience, children, footer }: AuthShellProps) {
  const { label, Icon, caption } = PORTALS[portal];

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-4 sm:p-6 md:p-10">
      <div className="w-full max-w-md md:max-w-4xl">
        <Card className="overflow-hidden p-0 shadow-lg ring-border">
          <CardContent className="grid p-0 md:grid-cols-2">
            <div className="flex flex-col gap-6 p-6 sm:p-8 md:p-10">
              <header className="flex flex-col items-center gap-3 text-center">
                <BrandLogo height={40} priority />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-primary">
                  <Icon className="size-3.5" aria-hidden="true" />
                  {label}
                </span>
                <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">{title}</h1>
                <p className="text-balance text-sm text-muted-foreground">{description}</p>
                {audience && <p className="text-balance text-xs text-muted-foreground">{audience}</p>}
              </header>
              {children}
            </div>

            <div className="relative hidden bg-muted md:block">
              {/* CC0 photograph, see docs/design-system.md 8.5. Decorative: the page
                  already names the portal, so it adds nothing for screen readers. */}
              <Image
                src="/images/auth-pampanga-fields.jpg"
                alt=""
                fill
                sizes="(min-width: 896px) 448px, 50vw"
                className="object-cover object-[28%_50%] dark:brightness-75"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent px-8 pt-24 pb-6">
                <p className="text-sm font-medium text-white">{caption}</p>
                <p className="text-xs text-white/80">Pampanga, Philippines</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {footer && <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  );
}
