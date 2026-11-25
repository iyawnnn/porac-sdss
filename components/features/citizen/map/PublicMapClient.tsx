"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { Feature, FeatureCollection } from "geojson";
import L from "leaflet";
import { ChevronDown, Layers, MapPin, X } from "lucide-react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { configureLeafletMarkerIcons } from "@/lib/gis/leaflet-icons";
import { getBarangayFeatureName } from "@/lib/gis/map-styles";
import { getCategoryMarkerSpec, glyphColor } from "@/lib/gis/category-spec";
import { publicCategoryMarkerIcon, publicClusterIcon } from "@/lib/gis/categoryMarker";
import type { PublicTicketGeoRow } from "@/lib/types/citizens-public-map";
import { useIsMobile } from "@/hooks/use-mobile";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AboutMapPopover } from "./AboutMapPopover";
import { PublicTicketPopup } from "./PublicTicketPopup";
import { cn } from "@/lib/utils";

configureLeafletMarkerIcons();

const GLASS = "border border-border bg-card/90 shadow-sm backdrop-blur-md";
// 44px touch targets on phones, compact 36px from sm up.
const CONTROL = cn(
  GLASS,
  "flex h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-card data-[state=open]:bg-card sm:h-9 sm:px-3",
);
// Phone bottom sheets (legend and report details): rounded top, capped height, iOS-style ease.
const BOTTOM_SHEET = "max-h-[85dvh] gap-0 rounded-t-2xl border-t border-border bg-popover p-0 duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]";

// Manuscript revision Phase 1, step 6c: citizens see no system score. UI Phase 2B.2 gives pins the
// admin map's category icon and colour (category identity only, never severity or risk); clusters
// are neutral counted badges. Boundaries, pins, clusters and popups are styled through .citizen-map
// in globals.css, so the admin maps' shared styles are untouched.
// Step 6d still holds: the zoom control sits bottom-right, clear of the title panel.

const MUNICIPALITY_STYLE: L.PathOptions = { className: "pm-municipality", weight: 2, fill: false, interactive: false };
const BARANGAY_STYLE: L.PathOptions = { className: "pm-barangay", weight: 1, color: "#000", fillColor: "#000", fillOpacity: 0 };
const SPIDER_LEG: L.PolylineOptions = { className: "pm-spider-leg", weight: 1.5, opacity: 1 };

// Space the floating controls take, so a fitted view never hides Porac under them. When the info
// panel floats on a narrow map (the full /map page on phones) it stacks above the finder.
function fitPadding(width: number, panelOnMap: boolean): L.FitBoundsOptions {
  const top = width >= 640 ? 64 : panelOnMap ? 168 : 72;
  return { paddingTopLeft: [20, top], paddingBottomRight: [60, 64] };
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Moving Leaflet's built-in control (rather than the react-leaflet ZoomControl component) avoids the StrictMode double-mount crash "Cannot read properties of undefined (reading 'bottomright')" on the dashboard mini-map, while keeping it off the title panel.
function ZoomControlBottomRight() {
  const map = useMap();
  useEffect(() => {
    map.zoomControl?.setPosition("bottomright");
  }, [map]);
  return null;
}

// Embedded in a scrolling page, the map must not swallow the wheel: profiling showed the page stopping
// mid-scroll while every wheel tick zoomed the map instead (with the redraw work that implies). The wheel
// zooms only after the map is clicked or focused, and goes back to the page once the pointer leaves.
// Buttons, pinch and double-click zoom are unaffected.
function WheelZoomOnIntent() {
  const map = useMap();
  useEffect(() => {
    const enable = () => map.scrollWheelZoom.enable();
    const disable = () => map.scrollWheelZoom.disable();
    // Native mouseleave on the container: Leaflet's own mouseout also fires between its inner layers.
    const container = map.getContainer();
    disable();
    map.on("click focus", enable);
    container.addEventListener("mouseleave", disable);
    container.addEventListener("focusout", disable);
    return () => {
      map.off("click focus", enable);
      container.removeEventListener("mouseleave", disable);
      container.removeEventListener("focusout", disable);
    };
  }, [map]);
  return null;
}

// Owns the viewport: frames all of Porac on load and on resize (until the citizen moves the map),
// flies to a selected barangay, and back to the same overview when the selection is cleared.
function ViewController({ overview, selection, panelOnMap }: { overview: L.LatLngBounds; selection: L.LatLngBounds | null; panelOnMap: boolean }) {
  const map = useMap();
  const userMoved = useRef(false);
  const programmatic = useRef(false);
  const target = useRef(selection ?? overview);
  const firstRun = useRef(true);
  const panel = useRef(panelOnMap);

  // Subscribed once. The observer reads the current target from a ref and refits only when the
  // container really changed size, so it never cuts across a fly animation.
  useEffect(() => {
    const markUser = () => { if (!programmatic.current) userMoved.current = true; };
    const settle = () => { programmatic.current = false; };
    let size = map.getSize();
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      const next = map.getSize();
      if (next.equals(size)) return;
      size = next;
      if (userMoved.current) return;
      programmatic.current = true;
      map.fitBounds(target.current, { ...fitPadding(next.x, panel.current), animate: false });
    });
    map.on("movestart", markUser);
    map.on("moveend", settle);
    observer.observe(map.getContainer());
    return () => {
      observer.disconnect();
      map.off("movestart", markUser);
      map.off("moveend", settle);
    };
  }, [map]);

  useEffect(() => {
    target.current = selection ?? overview;
    // The map opens on the overview through MapContainer's bounds; nothing to animate yet.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    programmatic.current = true;
    userMoved.current = false;
    map.flyToBounds(target.current, { ...fitPadding(map.getSize().x, panel.current), maxZoom: 16, duration: 0.8, animate: !prefersReducedMotion() });
  }, [map, overview, selection]);
  return null;
}

function countBy(tickets: PublicTicketGeoRow[], key: "category" | "barangay_name") {
  const counts = new Map<string, number>();
  for (const ticket of tickets) counts.set(ticket[key], (counts.get(ticket[key]) ?? 0) + 1);
  return counts;
}

const LEGEND_NOTE = "Colours identify the category only, not severity, priority or risk. Numbered circles group nearby reports.";

function LegendList({ categories }: { categories: [string, number][] }) {
  return (
    <ul className="flex flex-col p-1.5">
      {categories.map(([category, count]) => {
        const { icon: Icon, color } = getCategoryMarkerSpec(category);
        return (
          <li key={category} className="flex min-h-10 items-center gap-3 rounded-md px-2.5 py-1.5 text-sm">
            <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full" style={{ background: color }}>
              <Icon color={glyphColor(color)} size={13} strokeWidth={2.25} />
            </span>
            <span className="min-w-0 flex-1 leading-snug">{category}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">{count.toLocaleString("en-PH")}</span>
          </li>
        );
      })}
    </ul>
  );
}

function MapLegend({ tickets, isMobile }: { tickets: PublicTicketGeoRow[]; isMobile: boolean }) {
  const categories = useMemo(() => [...countBy(tickets, "category")].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), [tickets]);
  if (categories.length === 0) return null;
  const label = <><Layers aria-hidden="true" className="size-4 text-muted-foreground" />Legend</>;

  // Phones: a bottom sheet, which has the room a popover above a short map lacks.
  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger className={CONTROL}>{label}</SheetTrigger>
        <SheetContent side="bottom" aria-describedby={undefined} className={BOTTOM_SHEET}>
          <SheetHeader className="shrink-0 border-b border-border px-4 py-3.5">
            <SheetTitle className="text-sm font-semibold">Report categories</SheetTitle>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:max-h-[calc(85dvh-9rem)]">
            <LegendList categories={categories} />
          </ScrollArea>
          <p className="shrink-0 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-xs leading-4 text-muted-foreground">{LEGEND_NOTE}</p>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover>
      <PopoverTrigger className={CONTROL}>{label}</PopoverTrigger>
      {/* One scroll region. The popover itself never scrolls (shadcn's default overflow-y-auto would add
          a second scrollbar). The cap sits on the Scroll Area's viewport: its height:100% can't resolve
          against a max-height-only parent, so the list height is derived from the space Radix reports
          above the trigger, minus the fixed header and note (about 7.5rem). */}
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0"
      >
        <p className="shrink-0 border-b border-border px-4 py-3 text-sm font-medium">Report categories</p>
        <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-[min(18rem,calc(var(--radix-popover-content-available-height)-7.5rem))]">
          <LegendList categories={categories} />
        </ScrollArea>
        <p className="shrink-0 border-t border-border px-4 py-3 text-xs leading-4 text-muted-foreground">{LEGEND_NOTE}</p>
      </PopoverContent>
    </Popover>
  );
}

// One pill: the trigger names the selection, and a divided clear button sits inside the same frame.
function BarangayPicker({ names, counts, selected, onSelect }: {
  names: string[];
  counts: Map<string, number>;
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn(GLASS, "flex h-11 max-w-full items-stretch overflow-hidden rounded-lg sm:h-9")}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex min-w-0 cursor-pointer items-center gap-1.5 px-3.5 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-card data-[state=open]:bg-card sm:px-3">
          <MapPin aria-hidden="true" className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
          <span className="truncate">{selected ? `Brgy. ${selected}` : "Find a barangay"}</span>
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="pm-finder w-72 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
        >
          <Command>
            <CommandInput placeholder="Search barangays" />
            <CommandList className="max-h-[min(18rem,calc(var(--radix-popover-content-available-height)-3rem))] p-1">
              <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">No barangay matches your search.</CommandEmpty>
              {names.map((name) => (
                <CommandItem
                  key={name}
                  value={name}
                  data-checked={name === selected}
                  onSelect={() => { onSelect(name); setOpen(false); }}
                  className="min-h-10 cursor-pointer gap-3 rounded-md px-2.5 py-2"
                >
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{counts.get(name) ?? 0}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && (
        <button
          type="button"
          aria-label="Show all of Porac"
          title="Show all of Porac"
          onClick={() => onSelect(null)}
          className="flex w-11 shrink-0 cursor-pointer items-center justify-center border-l border-border text-muted-foreground transition-colors duration-150 hover:bg-card hover:text-foreground sm:w-9"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// Marks a pin while its popup is open, so hover and "selected" share one silhouette (globals.css).
const PIN_EVENTS: L.LeafletEventHandlerFnMap = {
  popupopen: (e) => (e.target as L.Marker).getElement()?.classList.add("is-active"),
  popupclose: (e) => (e.target as L.Marker).getElement()?.classList.remove("is-active"),
};

export default function PublicMapClient({
  barangays,
  tickets,
  heightClassName = "h-[calc(100dvh-4rem-1px)]",
  preview = false,
}: {
  barangays: FeatureCollection;
  tickets: PublicTicketGeoRow[];
  heightClassName?: string;
  preview?: boolean;
}) {
  const [municipalBoundary, setMunicipalBoundary] = useState<FeatureCollection | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const barangayLayers = useRef(new Map<string, L.Path>());
  const isMobile = useIsMobile();
  // Phones show a report's details in a bottom sheet instead of a Leaflet popup. The pin stays marked
  // through its icon (not a hand-toggled class, which Leaflet drops when it redraws the marker).
  const [sheetTicket, setSheetTicket] = useState<PublicTicketGeoRow | null>(null);
  // The dashboard preview shows its title, count and disclaimer outside the map on phones (DashboardSections).
  const panelOnMap = !preview;

  useEffect(() => {
    fetch("/assets/gis/porac_osm_boundary.json")
      .then((res) => (res.ok ? res.json() : null))
      .then(setMunicipalBoundary);
  }, []);

  const features = useMemo(() => new Map(barangays.features.map((f) => [getBarangayFeatureName(f), f])), [barangays]);
  const names = useMemo(() => [...features.keys()].sort((a, b) => a.localeCompare(b)), [features]);
  const barangayCounts = useMemo(() => countBy(tickets, "barangay_name"), [tickets]);
  // Porac's real extent: every barangay polygon, not a hand-tuned centre and zoom.
  const overview = useMemo(() => L.geoJSON(barangays).getBounds(), [barangays]);
  const selection = useMemo(() => {
    const feature = selected ? features.get(selected) : undefined;
    return feature ? L.geoJSON(feature).getBounds() : null;
  }, [features, selected]);

  // Leaflet's setStyle can't change a path's class, so the highlight is toggled on the element itself.
  useEffect(() => {
    for (const [name, layer] of barangayLayers.current) {
      layer.getElement()?.classList.toggle("pm-barangay-selected", name === selected);
      if (name === selected) layer.bringToFront();
    }
  }, [selected]);

  function bindBarangay(feature: Feature, layer: L.Layer) {
    const name = getBarangayFeatureName(feature);
    barangayLayers.current.set(name, layer as L.Path);
    (layer as L.Path).bindTooltip(`Brgy. ${name}`, { sticky: true, direction: "top", className: "barangay-boundary-tooltip" });
    // Selecting is idempotent: clicking the selected barangay again keeps it. Only the clear button deselects.
    layer.on("click", () => setSelected(name));
  }

  function onSheetOpenChange(open: boolean) {
    if (!open) setSheetTicket(null);
  }

  return (
    <div className={`${heightClassName} citizen-map relative isolate w-full`}>
      {/* One control per corner: barangays top-left, map info top-right, legend bottom-left, zoom bottom-right.
          On the dashboard's phone layout the info panel moves out of the map; on /map it stacks above the
          finder. The row ignores pointer events so the map stays draggable between them. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] flex flex-col-reverse items-start gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="pointer-events-auto max-w-full sm:max-w-[45%]">
          <BarangayPicker names={names} counts={barangayCounts} selected={selected} onSelect={setSelected} />
        </div>
        {/* The title stays a direct child of this panel: e2e/citizen-map.spec.ts treats the panel as a no-click zone. */}
        <div className={cn(GLASS, "pointer-events-auto relative w-full rounded-xl py-2.5 ps-3.5 pe-10 text-sm sm:w-auto sm:max-w-[22rem]", !panelOnMap ? "max-sm:hidden" : undefined)}>
          <p className="leading-5 font-semibold text-foreground">Public Report Map</p>
          <p className="leading-5 text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{tickets.length.toLocaleString("en-PH")}</span>{" "}
            {tickets.length === 0 ? "active public reports right now" : "active public reports"}
          </p>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">Reported concerns only. Not a hazard or risk map.</p>
          <AboutMapPopover className="absolute end-2 top-2" />
        </div>
      </div>

      <div className="absolute start-3 bottom-3 z-[1000]">
        <MapLegend tickets={tickets} isMobile={isMobile} />
      </div>

      {/* zoomSnap 0.25: whole-step zoom can only fit Porac one full level too far out. */}
      <MapContainer
        bounds={overview}
        zoomSnap={0.25}
        boundsOptions={fitPadding(window.innerWidth, panelOnMap)}
        className={cn("h-full w-full", preview && "bg-muted!")}
      >
        <ZoomControlBottomRight />
        {preview && <WheelZoomOnIntent />}
        <ViewController overview={overview} selection={selection} panelOnMap={panelOnMap} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
          className="map-tile-muted"
        />
        <GeoJSON data={barangays} style={() => BARANGAY_STYLE} onEachFeature={bindBarangay} />
        {municipalBoundary && <GeoJSON data={municipalBoundary} style={() => MUNICIPALITY_STYLE} />}
        <MarkerClusterGroup
          chunkedLoading
          showCoverageOnHover={false}
          maxClusterRadius={48}
          spiderLegPolylineOptions={SPIDER_LEG}
          iconCreateFunction={publicClusterIcon}
        >
          {tickets.map((ticket) => (
            <Marker
              key={ticket.key}
              position={[ticket.lat, ticket.lng]}
              icon={publicCategoryMarkerIcon(ticket.category, sheetTicket?.key === ticket.key)}
              title={ticket.category}
              eventHandlers={isMobile ? { click: () => setSheetTicket(ticket) } : PIN_EVENTS}
            >
              {!isMobile && (
                <Popup minWidth={248} maxWidth={272} autoPanPaddingTopLeft={[16, 112]} autoPanPaddingBottomRight={[16, 64]}>
                  <PublicTicketPopup ticket={ticket} />
                </Popup>
              )}
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>

      {/* Phones: the same privacy-limited card as the desktop popup, in a bottom sheet. */}
      <Sheet open={sheetTicket !== null} onOpenChange={onSheetOpenChange}>
        <SheetContent side="bottom" aria-describedby={undefined} className={BOTTOM_SHEET}>
          <SheetTitle className="sr-only">{sheetTicket ? `${sheetTicket.category} report` : "Report details"}</SheetTitle>
          <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:max-h-[85dvh]">
            <div className="px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {sheetTicket && <PublicTicketPopup ticket={sheetTicket} />}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
