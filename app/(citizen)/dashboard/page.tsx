import { Suspense, cache } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Plus } from "lucide-react";
import { apiGet, getCitizenSessionFromApi } from "@/lib/api-client";
import type { MyReportsPage } from "@/lib/types/citizens-reports";
import type { PublicTicketGeoRow, BarangayGeoFeatureCollection } from "@/lib/types/citizens-public-map";
import { CitizenUnauthorized } from "@/components/features/citizen/dashboard/CitizenUnauthorized";
import {
  COMMUNITY_SPAN,
  CommunityMap,
  RecentReportsPanel,
  TopCategoriesPanel,
  MAP_HEIGHT,
  MapSkeleton,
  MyReportsPanel,
  PanelSkeleton,
} from "@/components/features/citizen/dashboard/DashboardSections";
import { SectionError } from "@/components/features/citizen/dashboard/DashboardClient";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

// Each section fetches on its own and streams in, so a slow or failed request only affects its section.
// null means the request failed: shown as an error, never as zero.
async function load<T>(path: string): Promise<T | null> {
  try {
    return await apiGet<T>(path);
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}

// The map and the Community Snapshot both read /public-map; cache() makes that one request per render.
const loadPublicMap = cache(() => load<{ barangays: BarangayGeoFeatureCollection; tickets: PublicTicketGeoRow[] }>("/public-map"));

async function MapSection() {
  const data = await loadPublicMap();
  if (!data) return <SectionError className={MAP_HEIGHT} title="The public report map couldn't be loaded" message="Your own reports are unaffected. Try again in a moment." />;
  return <CommunityMap barangays={data.barangays} tickets={data.tickets} />;
}

async function PersonalSection() {
  // Counts for every report plus only the newest three rows, instead of the whole history.
  const summary = await load<MyReportsPage>("/reports/mine/page?pageSize=3");
  if (!summary) return <SectionError className="md:col-span-2" title="Your reports couldn't be loaded" message="Nothing has changed with your reports. Try again in a moment." />;
  return (
    <>
      <MyReportsPanel counts={summary.counts} />
      <RecentReportsPanel reports={summary.items} total={summary.total} />
    </>
  );
}

async function CommunitySection() {
  const data = await loadPublicMap();
  if (!data) return <SectionError className={COMMUNITY_SPAN} title="Top categories are unavailable" message="They load with the public report map." />;
  return <TopCategoriesPanel tickets={data.tickets} />;
}

export default async function DashboardPage() {
  const session = await getCitizenSessionFromApi();
  if (!session) return <CitizenUnauthorized />;
  const firstName = session.citizenName.trim().split(/\s+/)[0];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Text as="h1" variant="heading" className="[overflow-wrap:anywhere]">
            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
          </Text>
          <Text variant="body-sm" color="muted" className="mt-1">
            Follow your reports and see what your neighbors are reporting across Porac.
          </Text>
        </div>
        <Button asChild className="h-11 shrink-0 gap-2 px-4 hover:bg-primary-hover active:bg-primary-pressed active:not-aria-[haspopup]:translate-y-0">
          <Link href="/report"><Plus aria-hidden="true" />Report Hazard</Link>
        </Button>
      </div>

      <Suspense fallback={<MapSkeleton />}>
        <MapSection />
      </Suspense>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Suspense fallback={<><PanelSkeleton /><PanelSkeleton /></>}>
          <PersonalSection />
        </Suspense>
        <Suspense fallback={<PanelSkeleton className={COMMUNITY_SPAN} />}>
          <CommunitySection />
        </Suspense>
      </div>
    </main>
  );
}
