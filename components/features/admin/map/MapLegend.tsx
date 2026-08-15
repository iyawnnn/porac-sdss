"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, LayersIcon } from "lucide-react";
import { TICKET_CATEGORIES } from "@/lib/types/admin-ticket-constants";
import { getUrgencyBandStyle } from "@/lib/utils/ui/urgency";
import { CATEGORY_MARKER_SPEC } from "@/lib/gis/categoryMarker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import styles from "./MapLegend.module.css";

const URGENCY_BANDS = ["Low", "Medium", "High"] as const;

function LegendBody() {
  return (
    <div className={`${styles.scrollViewport} max-h-72 space-y-3 overflow-y-auto pr-2`}>
      <section>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Categories</p>
        <div className="space-y-1.5">
          {TICKET_CATEGORIES.map((category) => {
            const spec = CATEGORY_MARKER_SPEC[category];
            const Icon = spec.icon;
            return (
              <div className="flex items-center gap-2" key={category}>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full" style={{ background: spec.color }}>
                  <Icon aria-hidden="true" className="size-3 text-white" />
                </span>
                <span className="text-xs text-foreground">{category}</span>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Urgency (outer ring)</p>
        <div className="space-y-1.5">
          {URGENCY_BANDS.map((band) => (
            <div className="flex items-center gap-2" key={band}>
              <span className="flex size-7 shrink-0 items-center justify-center"><span className="size-4 rounded-full border-2 border-white" style={{ boxShadow: `0 0 0 2px ${getUrgencyBandStyle(band).hex}` }} /></span>
              <span className="text-xs text-foreground">
                {band}
                {band === "High" ? " - pulses" : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
      <p className="text-xs text-muted-foreground">Numbered circles are clusters; their ring shows the highest urgency inside.</p>
    </div>
  );
}

export function MapLegend() {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Desktop: floating collapsible corner card, bottom-left, opposite map controls and zoom. */}
      <Card className="absolute bottom-4 left-4 hidden w-64 gap-0 p-0 md:block">
        <button
          aria-expanded={expanded}
          className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-muted/60 focus-visible:outline-none"
          onClick={() => setExpanded((prev) => !prev)}
          type="button"
        >
          <span className="flex items-center gap-1.5"><LayersIcon aria-hidden="true" className="size-3.5" /> Legend</span>
          {expanded ? <ChevronUp aria-hidden="true" className="size-3.5" /> : <ChevronDown aria-hidden="true" className="size-3.5" />}
        </button>
        {expanded && (
          <div className="border-t p-3">
            <LegendBody />
          </div>
        )}
      </Card>

      {/* Mobile: Sheet, opened from a compact floating button */}
      <div className="absolute bottom-4 left-4 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button className="cursor-pointer shadow-md" size="sm" variant="secondary">
              <LayersIcon aria-hidden="true" className="size-3.5" />
              Legend
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Map Legend</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-4">
              <LegendBody />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
