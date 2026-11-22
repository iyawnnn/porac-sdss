import Link from "next/link";
import { AuthShell } from "@/components/features/auth/AuthShell";
import { AUTH_BUTTON, AUTH_CTA_BUTTON, AuthCtaLabel, AuthLink, AuthNote } from "@/components/features/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { MUNICIPALITY } from "@/lib/municipality-config";

// Public home: what the system is and where to sign in. It reuses the auth layout so
// the front door and the sign-in pages read as one product. No session lookup, so it
// never depends on the API and signed-in citizens simply continue from the sign-in page.
export default function Home() {
  return (
    <AuthShell
      hideBackLink
      title="Report local concerns"
      description={`PORAC-SDSS is the ${MUNICIPALITY.name}'s decision support system for infrastructure and hazard reports. Residents report with a photo and a map pin, municipal offices review and act, and you can follow every report to its resolution.`}
    >
      <div className="flex flex-col gap-(--auth-gap)">
        <Button asChild className={AUTH_CTA_BUTTON}>
          <Link href="/login">
            <AuthCtaLabel>Citizen Sign In</AuthCtaLabel>
          </Link>
        </Button>
        <Button asChild variant="outline" className={AUTH_BUTTON}>
          <Link href="/signup">Create Account</Link>
        </Button>
        <AuthNote>
          Municipal staff? <AuthLink href="/admin/login">Staff access</AuthLink>
        </AuthNote>
      </div>
    </AuthShell>
  );
}
