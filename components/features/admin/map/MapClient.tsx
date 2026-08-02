"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { Feature, FeatureCollection } from "geojson";
import L from "leaflet";
import "leaflet.heat";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { AdminTicketGeoRow } from "@/lib/types/admin-tickets";
import { MUNICIPALITY } from "@/lib/municipality-config";
import { configureLeafletMarkerIcons } from "@/lib/gis/leaflet-icons";
import { bindBarangayInteractions, getBarangayFeatureName, styleBarangayFeature, styleMunicipalBoundary } from "@/lib/gis/map-styles";
import { categoryClusterIcon, categoryMarkerIcon, registerMarkerUrgency } from "@/lib/gis/categoryMarker";
import { MapControls } from "./MapControls";
import { MapLegend } from "./MapLegend";
import { MapFilterBar, EMPTY_MAP_FILTERS, type MapFilterState } from "./MapFilterBar";
import { TicketPopup } from "./TicketPopup";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

configureLeafletMarkerIcons();
const CITY_CENTER: [number, number] = [MUNICIPALITY.centerLat, MUNICIPALITY.centerLng];
type MapMode = "pins" | "heatmap";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function HeatmapLayer({ tickets }: { tickets: AdminTicketGeoRow[] }) {
  const map = useMap();
  useEffect(() => {
    const points: L.HeatLatLngTuple[] = tickets.map((ticket) => [ticket.lat, ticket.lng, Math.max((ticket.priority_index ?? 1) / 100, 0.15)]);
    const layer = L.heatLayer(points, { radius: 28, blur: 20, maxZoom: MUNICIPALITY.defaultZoom + 2, gradient: { 0.2: "#2b6cb0", 0.5: "#d99a00", 0.75: "#e2680e", 1: "#c42b1c" } }).addTo(map);
    return () => { layer.remove(); };
  }, [map, tickets]);
  return null;
}

function MapSizeInvalidator() {
  const map = useMap();
  useEffect(() => {
    let animationFrame: number | undefined;
    const invalidateSize = () => { if (animationFrame) cancelAnimationFrame(animationFrame); animationFrame = requestAnimationFrame(() => map.invalidateSize({ animate: false, pan: false })); };
    const resizeObserver = new ResizeObserver(invalidateSize); resizeObserver.observe(map.getContainer()); window.addEventListener("resize", invalidateSize); invalidateSize();
    return () => { resizeObserver.disconnect(); window.removeEventListener("resize", invalidateSize); if (animationFrame) cancelAnimationFrame(animationFrame); };
  }, [map]);
  return null;
}

function MapBackgroundReset({ onClear }: { onClear: () => void }) { useMapEvents({ click: onClear }); return null; }

function SelectedBarangayViewport({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds || !bounds.isValid()) return;
    const padding: L.PointExpression = window.matchMedia("(min-width: 768px)").matches ? [72, 280] : [40, 40];
    map.flyToBounds(bounds, { animate: true, duration: 1.15, padding });
  }, [bounds, map]);
  return null;
}

function CityViewport({ resetKey }: { resetKey: number }) {
  const map = useMap();
  useEffect(() => {
    if (resetKey === 0) return;
    map.flyTo(CITY_CENTER, MUNICIPALITY.defaultZoom, { animate: true, duration: 1.15 });
  }, [map, resetKey]);
  return null;
}

function BarangayBoundaries({ data, selectedName, onSelect }: { data: FeatureCollection; selectedName: string | null; onSelect: (name: string, bounds: L.LatLngBounds) => void }) {
  const onEachFeature = useCallback((feature: Feature, layer: L.Layer) => bindBarangayInteractions(feature, layer, { isSelected: getBarangayFeatureName(feature) === selectedName, onSelect }), [onSelect, selectedName]);
  return <GeoJSON data={data} key={selectedName ?? "no-barangay-selection"} onEachFeature={onEachFeature} style={(feature) => getBarangayFeatureName(feature as Feature) === selectedName ? { color: "#1D4ED8", weight: 3, opacity: 1, fillColor: "#3B82F6", fillOpacity: 0.16 } : styleBarangayFeature()} />;
}

function matchesFilters(ticket: AdminTicketGeoRow, filters: MapFilterState): boolean {
  if (filters.category && ticket.category !== filters.category) return false;
  if (filters.barangayName && ticket.barangay_name !== filters.barangayName) return false;
  if (filters.urgency && ticket.urgency_band !== filters.urgency) return false;
  if (filters.status && ticket.status !== filters.status) return false;
  if (filters.search) { const needle = filters.search.trim().toLowerCase(); if (needle && !`${ticket.title ?? ""} ${ticket.category} ${ticket.barangay_name}`.toLowerCase().includes(needle)) return false; }
  return true;
}

export default function MapClient({ office }: { office?: "MEO" | "MDRRMO" }) {
  const [tickets, setTickets] = useState<AdminTicketGeoRow[]>([]);
  const [barangays, setBarangays] = useState<FeatureCollection | null>(null);
  const [municipalBoundary, setMunicipalBoundary] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<MapMode>("pins");
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [filters, setFilters] = useState<MapFilterState>(EMPTY_MAP_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedBarangay, setSelectedBarangay] = useState<string | null>(null);
  const [selectedBarangayBounds, setSelectedBarangayBounds] = useState<L.LatLngBounds | null>(null);
  const [viewportResetKey, setViewportResetKey] = useState(0);

  useEffect(() => { const controller = new AbortController(); const loadTickets = async () => { setLoading(true); const qs = office ? `?office=${office}` : ""; try { const response = await fetch(`/api/admin/tickets/geo${qs}`, { signal: controller.signal }); if (!response.ok) throw new Error("Unable to load tickets"); setTickets(await response.json() as AdminTicketGeoRow[]); } catch { if (!controller.signal.aborted) setTickets([]); } finally { if (!controller.signal.aborted) setLoading(false); } }; void loadTickets(); return () => controller.abort(); }, [office]);
  useEffect(() => { fetch("/api/admin/barangays/geo").then((res) => res.json()).then(setBarangays); fetch("/assets/gis/porac_osm_boundary.json").then((res) => res.ok ? res.json() : null).then(setMunicipalBoundary); }, []);

  const barangayOptions = useMemo(() => [...new Set(tickets.map((t) => t.barangay_name))].sort(), [tickets]);
  const filteredTickets = useMemo(() => tickets.filter((t) => matchesFilters(t, filters)), [tickets, filters]);
  const selectedTicket = useMemo(() => tickets.find((ticket) => ticket.id === selectedId) ?? null, [selectedId, tickets]);
  const updateFilters = useCallback((patch: Partial<MapFilterState>) => setFilters((previous) => ({ ...previous, ...patch })), []);
  const clearBarangaySelection = useCallback(() => { setSelectedBarangay((current) => { if (current) setFilters((previous) => previous.barangayName === current ? { ...previous, barangayName: "" } : previous); return null; }); setSelectedBarangayBounds(null); setViewportResetKey((current) => current + 1); }, []);
  const selectBarangay = useCallback((name: string, bounds: L.LatLngBounds) => {
    if (selectedBarangay === name) { clearBarangaySelection(); return; }
    setSelectedBarangay(name); setSelectedBarangayBounds(bounds); setFilters((previous) => ({ ...previous, barangayName: name }));
  }, [clearBarangaySelection, selectedBarangay]);

  const isMobile = useIsMobile();

  return <section aria-labelledby="admin-map-heading" className="admin-map-workspace flex min-h-0 flex-1 flex-col"><h1 className="sr-only" id="admin-map-heading">Interactive Incident Map</h1><div className="relative isolate min-h-0 flex-1 overflow-hidden">
    {loading && <p className="absolute top-4 left-1/2 z-30 -translate-x-1/2 rounded-md border bg-card px-3 py-1 text-sm text-card-foreground shadow-sm">Loading tickets...</p>}
    <div className="pointer-events-none absolute inset-0 z-20"><div className="pointer-events-auto"><MapControls mode={mode} onModeChange={setMode} onToggleBoundaries={() => setShowBoundaries((previous) => !previous)} showBoundaries={showBoundaries} /></div><div className="pointer-events-auto"><MapFilterBar barangayOptions={barangayOptions} filters={filters} onChange={updateFilters} onReset={() => { setFilters(EMPTY_MAP_FILTERS); setSelectedBarangay(null); setSelectedBarangayBounds(null); setViewportResetKey((current) => current + 1); }} /></div><div className="pointer-events-auto"><MapLegend /></div></div>
    {isMobile && <Sheet onOpenChange={(open) => { if (!open) setSelectedId(null); }} open={Boolean(selectedTicket)}><SheetContent className="max-h-[82vh] overflow-y-auto p-0" showCloseButton={false} side="bottom"><SheetHeader className="sr-only"><SheetTitle>Ticket details</SheetTitle></SheetHeader>{selectedTicket && <TicketPopup onClose={() => setSelectedId(null)} ticket={selectedTicket} />}</SheetContent></Sheet>}
    <MapContainer center={CITY_CENTER} className="relative z-0 h-full w-full" zoom={MUNICIPALITY.defaultZoom} zoomControl={false}><MapSizeInvalidator /><MapBackgroundReset onClear={() => { setSelectedId(null); clearBarangaySelection(); }} /><SelectedBarangayViewport bounds={selectedBarangayBounds} /><CityViewport resetKey={viewportResetKey} /><ZoomControl position="bottomright" /><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />{showBoundaries && municipalBoundary && <GeoJSON data={municipalBoundary} style={styleMunicipalBoundary} />}{showBoundaries && barangays && <BarangayBoundaries data={barangays} onSelect={selectBarangay} selectedName={selectedBarangay} />}{mode === "heatmap" ? <HeatmapLayer tickets={filteredTickets} /> : <MarkerClusterGroup chunkedLoading iconCreateFunction={categoryClusterIcon}>{filteredTickets.map((ticket) => <Marker eventHandlers={{ click: () => setSelectedId(ticket.id), popupclose: () => setSelectedId((current) => current === ticket.id ? null : current) }} icon={categoryMarkerIcon(ticket.category, ticket.urgency_band, { selected: ticket.id === selectedId })} key={ticket.id} position={[ticket.lat, ticket.lng]} ref={(marker) => { if (marker) registerMarkerUrgency(marker, ticket.urgency_band); }} >{!isMobile && <Popup autoPan={false} className="admin-ticket-popup" closeButton={false} offset={[0, -20]}><TicketPopup onClose={() => setSelectedId(null)} ticket={ticket} /></Popup>}</Marker>)}</MarkerClusterGroup>}</MapContainer>
  </div></section>;
}