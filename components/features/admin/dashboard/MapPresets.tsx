import Link from "next/link";
import { AlertTriangle, Droplets, Flame, MapPin, TreeDeciduous, Trash2, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MapPreset {
  label: string;
  icon: LucideIcon;
  params: Record<string, string>;
}

// Every preset maps to a real, already-URL-synced /admin/map filter (see
// app/admin/map/page.tsx and MapClient.tsx's Phase 1 work) — category and
// urgency are the only filters presets use, since those are the only ones
// with a fixed, known-good value per office. Do not add a preset here for a
// filter that doesn't already exist and apply on the map.
const MEO_PRESETS: MapPreset[] = [
  { label: "Drainage Issues", icon: Droplets, params: { category: "Clogged Drain" } },
  { label: "Potholes & Road Damage", icon: MapPin, params: { category: "Pothole" } },
  { label: "Illegal Dumping", icon: Trash2, params: { category: "Illegal Dumping" } },
  { label: "High-Urgency Open Work", icon: AlertTriangle, params: { urgency: "Critical" } },
];

const MDRRMO_PRESETS: MapPreset[] = [
  { label: "Flooding Reports", icon: Droplets, params: { category: "Flooding" } },
  { label: "Fallen Trees", icon: TreeDeciduous, params: { category: "Fallen Tree" } },
  { label: "High-Urgency Reports", icon: Flame, params: { urgency: "Critical" } },
];

function presetHref(preset: MapPreset, office?: "MEO" | "MDRRMO"): string {
  const params = new URLSearchParams(preset.params);
  // Office-scoped admins never need ?office= — the map already scopes to
  // their session office server-side (see app/admin/map/page.tsx) — this is
  // only added for a system admin, who otherwise sees a city-wide map and
  // needs the param to make an "MEO preset" actually MEO-only.
  if (office) params.set("office", office);
  return `/admin/map?${params.toString()}`;
}

function PresetGroup({ office, presets }: { office?: "MEO" | "MDRRMO"; presets: MapPreset[] }) {
  return (
    <div className="space-y-1.5">
      {office && <Badge variant="secondary">{office}</Badge>}
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const Icon = preset.icon;
          return (
            <Button asChild key={preset.label} size="sm" variant="outline">
              <Link href={presetHref(preset, office)}>
                <Icon />
                {preset.label}
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// A dashboard section, not a new route or sidebar item — every link here
// resolves to a real, already-filterable /admin/map view (Phase 1's
// URL-synced filters), never a fake navigation link to a filter the map
// can't actually apply.
export function MapPresets({ isSystemAdmin, office }: { isSystemAdmin: boolean; office?: "MEO" | "MDRRMO" }) {
  return (
    <Card aria-label="Map presets" className="lg:col-span-2 dashboard:col-span-4" role="region">
      <CardHeader>
        <CardTitle>Map Presets</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isSystemAdmin ? (
          <>
            <PresetGroup office="MEO" presets={MEO_PRESETS} />
            <PresetGroup office="MDRRMO" presets={MDRRMO_PRESETS} />
          </>
        ) : (
          <PresetGroup presets={office === "MDRRMO" ? MDRRMO_PRESETS : MEO_PRESETS} />
        )}
      </CardContent>
    </Card>
  );
}
