"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// The public map's privacy and scope notes. Shared by the floating map panel (desktop, /map) and the
// dashboard's phone header above the map, so the wording lives in one place.
export function AboutMapPopover({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="About this map"
        className={cn(
          "flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground",
          className,
        )}
      >
        <Info aria-hidden="true" className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} collisionPadding={12} className="w-72 text-sm">
        <p className="font-medium">About this map</p>
        <ul className="mt-2 list-disc space-y-1.5 ps-4 text-muted-foreground">
          <li>It shows active reports from residents: reported, under review or in progress.</li>
          <li>Locations are approximate, to about 100 metres.</li>
          <li>Reporter names, titles, photos and internal records are never shown. Your own reports open in full.</li>
          <li>It shows what residents reported, not assessed hazard or risk levels.</li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
