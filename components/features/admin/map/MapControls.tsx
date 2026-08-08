"use client";

import { LayersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type MapMode = "pins" | "heatmap";
type Office = "MEO" | "MDRRMO";

const OFFICE_OPTIONS: { value: Office | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "MEO", label: "MEO" },
  { value: "MDRRMO", label: "MDRRMO" },
];

function ControlsBody({
  mode,
  onModeChange,
  showBoundaries,
  onToggleBoundaries,
  isSystemAdmin,
  office,
  onOfficeChange,
}: {
  mode: MapMode;
  onModeChange: (mode: MapMode) => void;
  showBoundaries: boolean;
  onToggleBoundaries: () => void;
  isSystemAdmin: boolean;
  office?: Office;
  onOfficeChange: (office: Office | undefined) => void;
}) {
  return (
    <>
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
        {isSystemAdmin ? (
          <div aria-label="Office" className="flex h-8 w-full justify-center overflow-hidden rounded-md border border-input" role="group">
            {OFFICE_OPTIONS.map((option) => {
              const isActive = option.value === null ? !office : office === option.value;
              return (
                <button
                  aria-current={isActive ? "true" : undefined}
                  className={`flex shrink-0 cursor-pointer items-center justify-center px-3 text-[0.8rem] font-medium whitespace-nowrap transition-colors not-first:border-l not-first:border-input ${
                    isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                  key={option.label}
                  onClick={() => onOfficeChange(option.value ?? undefined)}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : (
          // Non-system-admins can't view another office's markers — the
          // backend clamps this regardless of what's requested, so the
          // toggle is replaced with a fixed label instead of a control
          // that would look interactive but do nothing.
          <Badge aria-label="Office" variant="secondary">My Office: {office}</Badge>
        )}
      </section>
    </>
  );
}

export function MapControls({
  mode,
  onModeChange,
  showBoundaries,
  onToggleBoundaries,
  isSystemAdmin,
  office,
  onOfficeChange,
}: {
  mode: MapMode;
  onModeChange: (mode: MapMode) => void;
  showBoundaries: boolean;
  onToggleBoundaries: () => void;
  isSystemAdmin: boolean;
  office?: Office;
  onOfficeChange: (office: Office | undefined) => void;
}) {
  const body = <ControlsBody isSystemAdmin={isSystemAdmin} mode={mode} office={office} onModeChange={onModeChange} onOfficeChange={onOfficeChange} onToggleBoundaries={onToggleBoundaries} showBoundaries={showBoundaries} />;

  return (
    <>
      {/* Desktop: floating corner card, mirrors MapFilterBar/MapLegend. */}
      <Card aria-label="Map controls" className="absolute top-4 right-4 hidden w-52 gap-3 p-3 text-sm md:flex md:flex-col">
        {body}
      </Card>

      {/* Mobile: Sheet, opened from a compact floating button. */}
      <div className="absolute top-4 right-4 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button className="cursor-pointer shadow-md" size="sm" variant="secondary">
              <LayersIcon aria-hidden="true" className="size-3.5" />
              Controls
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Map Controls</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3 px-4 pb-4">{body}</div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
