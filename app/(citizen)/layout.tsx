import { getCitizenSession } from "@/lib/auth/getCitizenSession";
import CitizenHeader from "./CitizenHeader";

export default async function CitizenLayout({ children }: { children: React.ReactNode }) {
  const session = await getCitizenSession();

  if (!session) return <>{children}</>;

  return (
    <div className="min-h-full bg-canvas">
      <CitizenHeader session={session} />
      {children}
    </div>
  );
}
