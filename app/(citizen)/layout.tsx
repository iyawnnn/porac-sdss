import { getCitizenSessionFromApi } from "@/lib/api-client";
import CitizenHeader from "@/components/layouts/CitizenHeader";

export default async function CitizenLayout({ children }: { children: React.ReactNode }) {
  const session = await getCitizenSessionFromApi();

  if (!session) return <>{children}</>;

  return (
    // citizen-shell switches the signed-in citizen app to neutral surfaces (globals.css).
    <div className="citizen-shell min-h-full bg-canvas">
      <CitizenHeader session={session} />
      {children}
    </div>
  );
}
