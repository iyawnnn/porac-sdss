"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayersIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type MapMode = "pins" | "heatmap";

const OFFICE_OPTIONS = [
  { value: null, label: "All" },
  { value: "MEO", label: "MEO" },
  { value: "MDRRMO", label: "MDRRMO" },
] as const;

export function MapControls({
  mode,
  onModeChange,
  showBoundaries,
  onToggleBoundaries,
}: {
  mode: MapMode;
  onModeChange: (mode: MapMode) => void;
  showBoundaries: boolean;
  onToggleBoundaries: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeOffice = searchParams.get("office");

  return (
    <Card className="absolute top-4 right-4 w-52 gap-3 p-3 text-sm">
      <section>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><LayersIcon aria-hidden="true" className="size-3.5" /> Layers</p>
        <ToggleGroup
          aria-label="Map display mode"
          className="w-full"
          onValueChange={(value) => {
            if (value === "pins" || value === "heatmap") onModeChange(value);
          }}
          size="sm"
          spacing={0}
          type="single"
          value={mode}
          variant="outline"
        >
          <ToggleGroupItem className="flex-1 cursor-pointer" value="pins">
            Pins
          </ToggleGroupItem>
          <ToggleGroupItem className="flex-1 cursor-pointer" value="heatmap">
            Heatmap
          </ToggleGroupItem>
        </ToggleGroup>
      </section>

      <section>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Boundaries</p>
        <Toggle
          aria-label="Toggle barangay and municipal boundaries"
          className="w-full cursor-pointer justify-start border border-input"
          onPressedChange={onToggleBoundaries}
          pressed={showBoundaries}
          size="sm"
          variant="outline"
        >
          {showBoundaries ? "Shown" : "Hidden"}
        </Toggle>
      </section>

      <section>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Office</p>
        <div className="flex h-8 w-full justify-center overflow-hidden rounded-md border border-input" role="group">
          {OFFICE_OPTIONS.map((option) => {
            const isActive = option.value === null ? !activeOffice || activeOffice === "all" : activeOffice === option.value;
            const href = option.value === null ? `${pathname}?office=all` : `${pathname}?office=${option.value}`;
            return (
              <Link
                aria-current={isActive ? "true" : undefined}
                className={`flex shrink-0 cursor-pointer items-center justify-center px-3 text-[0.8rem] font-medium whitespace-nowrap transition-colors not-first:border-l not-first:border-input ${
                  isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
                href={href}
                key={option.label}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </section>
    </Card>
  );
}
