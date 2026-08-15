"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, FilterIcon, LayersIcon, XIcon } from "lucide-react";
import { getCategoryMarkerSpec } from "@/lib/gis/categoryMarker";
import { getUrgencyBandStyle } from "@/lib/utils/ui/urgency";
import { TICKET_CATEGORIES, TICKET_STATUSES } from "@/lib/types/admin-ticket-constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export interface MapFilterState { search: string; category: string; barangayName: string; urgency: string; status: string; }
export const EMPTY_MAP_FILTERS: MapFilterState = { search: "", category: "", barangayName: "", urgency: "", status: "" };
function countActive(filters: MapFilterState): number { return Object.values(filters).filter((value) => value !== "").length; }

function FilterControls({ filters, onChange, barangayOptions }: { filters: MapFilterState; onChange: (patch: Partial<MapFilterState>) => void; barangayOptions: string[] }) {
  const categorySpec = filters.category ? getCategoryMarkerSpec(filters.category) : null;
  const CategoryIcon = categorySpec?.icon ?? LayersIcon;
  return <div className="flex flex-col gap-2">
    <Input aria-label="Search tickets on the map" className="cursor-text" onChange={(event) => onChange({ search: event.target.value })} placeholder="Search title, barangay..." type="search" value={filters.search} />
    <Select onValueChange={(value) => onChange({ category: value === "all" ? "" : value })} value={filters.category || "all"}><SelectTrigger aria-label="Category" className="w-full cursor-pointer justify-start hover:bg-muted/50 [&>svg:last-child]:ml-auto [&_.filter-option-icon]:hidden"><CategoryIcon aria-hidden="true" className="size-4 shrink-0" style={categorySpec ? { color: categorySpec.color } : undefined} /><SelectValue placeholder="All categories" /></SelectTrigger><SelectContent><SelectItem className="cursor-pointer" value="all"><LayersIcon aria-hidden="true" className="filter-option-icon" />All categories</SelectItem>{TICKET_CATEGORIES.map((category) => { const spec = getCategoryMarkerSpec(category); const Icon = spec.icon; return <SelectItem className="cursor-pointer" key={category} value={category}><Icon aria-hidden="true" className="filter-option-icon" style={{ color: spec.color }} />{category}</SelectItem>; })}</SelectContent></Select>
    <Select onValueChange={(value) => onChange({ urgency: value === "all" ? "" : value })} value={filters.urgency || "all"}><SelectTrigger aria-label="Urgency" className="w-full cursor-pointer justify-start hover:bg-muted/50 [&>svg:last-child]:ml-auto [&_.filter-option-icon]:hidden"><span aria-hidden="true" className="size-3 shrink-0 rounded-full border-2 border-background" style={{ boxShadow: `0 0 0 2px ${getUrgencyBandStyle(filters.urgency || null).hex}` }} /><SelectValue /></SelectTrigger><SelectContent><SelectItem className="cursor-pointer" value="all"><span aria-hidden="true" className="filter-option-icon size-3 rounded-full border-2 border-background ring-2 ring-muted-foreground" />All urgency</SelectItem>{(["High", "Medium", "Low"] as const).map((band) => <SelectItem className="cursor-pointer" key={band} value={band}><span aria-hidden="true" className="filter-option-icon size-3 rounded-full border-2 border-background" style={{ boxShadow: `0 0 0 2px ${getUrgencyBandStyle(band).hex}` }} />{band}</SelectItem>)}</SelectContent></Select>
    <Select onValueChange={(value) => onChange({ barangayName: value === "all" ? "" : value })} value={filters.barangayName || "all"}><SelectTrigger aria-label="Barangay" className="w-full cursor-pointer justify-start hover:bg-muted/50 [&>svg:last-child]:ml-auto [&_.filter-option-icon]:hidden"><SelectValue /></SelectTrigger><SelectContent className="min-w-56"><SelectItem className="cursor-pointer" value="all">All barangays</SelectItem>{barangayOptions.map((barangay) => <SelectItem className="cursor-pointer" key={barangay} value={barangay}>{barangay}</SelectItem>)}</SelectContent></Select>
    <Select onValueChange={(value) => onChange({ status: value === "all" ? "" : value })} value={filters.status || "all"}><SelectTrigger aria-label="Status" className="w-full cursor-pointer justify-start hover:bg-muted/50 [&>svg:last-child]:ml-auto [&_.filter-option-icon]:hidden"><SelectValue /></SelectTrigger><SelectContent><SelectItem className="cursor-pointer" value="all">All statuses</SelectItem>{TICKET_STATUSES.map((status) => <SelectItem className="cursor-pointer" key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select>
  </div>;
}

export function MapFilterBar({ filters, onChange, onReset, barangayOptions }: { filters: MapFilterState; onChange: (patch: Partial<MapFilterState>) => void; onReset: () => void; barangayOptions: string[] }) {
  const [expanded, setExpanded] = useState(false); const activeCount = countActive(filters);
  const reset = <Button className="w-full cursor-pointer" onClick={onReset} size="sm" variant="ghost"><XIcon />Reset filters</Button>;
  return <><div className="absolute top-4 left-4 hidden md:block"><Card className="w-64 gap-0 p-0 shadow-md"><button aria-expanded={expanded} className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-muted/60 focus-visible:outline-none" onClick={() => setExpanded((previous) => !previous)} type="button"><FilterIcon aria-hidden="true" />Filters{activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}{expanded ? <ChevronUpIcon aria-hidden="true" className="ml-auto" /> : <ChevronDownIcon aria-hidden="true" className="ml-auto" />}</button>{expanded && <CardContent className="flex flex-col gap-2 border-t p-3"><FilterControls barangayOptions={barangayOptions} filters={filters} onChange={onChange} />{activeCount > 0 && reset}</CardContent>}</Card></div><div className="absolute top-4 left-4 md:hidden"><Sheet><SheetTrigger asChild><Button className="cursor-pointer shadow-md" size="sm" variant="secondary"><FilterIcon aria-hidden="true" />Filters{activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}</Button></SheetTrigger><SheetContent side="bottom"><SheetHeader><SheetTitle>Map Filters</SheetTitle></SheetHeader><div className="flex flex-col gap-2 px-4 pb-4"><FilterControls barangayOptions={barangayOptions} filters={filters} onChange={onChange} />{activeCount > 0 && reset}</div></SheetContent></Sheet></div></>;
}