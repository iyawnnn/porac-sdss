"use client";

import { ArrowUpDownIcon, Columns3Icon, Rows3Icon, SearchIcon, XIcon } from "lucide-react";
import type { TicketSort } from "@/lib/types/admin-ticket-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HIDEABLE_QUEUE_COLUMNS,
  isColumnVisible,
  type QueueColumnKey,
  type QueueColumnVisibility,
  type QueueDensity,
} from "./columns";
import { QueueFiltersPopover, type QueueFilterValues } from "./QueueFiltersPopover";

export interface FilterChip {
  key: string;
  label: string;
}

// Sort options are exactly what TicketsService.parseTicketQuery accepts. There
// is deliberately no "Operational priority" option: priority_index is a
// different formula (citizen severity + age + density) with no ORDER BY support
// on the list endpoint, and offering it would imply a ranking the server cannot
// produce. See CLAUDE.md's Severity/Urgency/Priority terminology note.
const SORT_LABELS: Record<TicketSort, string> = {
  priority_desc: "Urgency: highest",
  priority_asc: "Urgency: lowest",
  newest: "Newest first",
};

interface Barangay {
  id: number;
  name: string;
}

export function QueueToolbar({
  searchInput,
  onSearchInput,
  filters,
  filterChips,
  activeFilterCount,
  barangays,
  isSystemAdmin,
  sessionOffice,
  onFilterChange,
  onRemoveChip,
  onClearAll,
  sort,
  onSortChange,
  columnVisibility,
  onToggleColumn,
  density,
  onDensityChange,
}: {
  searchInput: string;
  onSearchInput: (value: string) => void;
  filters: QueueFilterValues;
  filterChips: FilterChip[];
  activeFilterCount: number;
  barangays: Barangay[];
  isSystemAdmin: boolean;
  sessionOffice?: string;
  onFilterChange: (patch: Partial<QueueFilterValues>) => void;
  onRemoveChip: (key: string) => void;
  onClearAll: () => void;
  sort: TicketSort;
  onSortChange: (sort: TicketSort) => void;
  columnVisibility: QueueColumnVisibility;
  onToggleColumn: (key: QueueColumnKey) => void;
  density: QueueDensity;
  onDensityChange: (density: QueueDensity) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-3.5 py-2.5">
      <div className="relative w-full max-w-[340px] min-w-[200px] flex-1">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search tickets"
          className="h-8 bg-card pl-8 text-[13px]"
          onChange={(e) => onSearchInput(e.target.value)}
          placeholder="Ticket ID, title or barangay"
          type="search"
          value={searchInput}
        />
      </div>

      <QueueFiltersPopover
        activeCount={activeFilterCount}
        barangays={barangays}
        isSystemAdmin={isSystemAdmin}
        onChange={onFilterChange}
        sessionOffice={sessionOffice}
        values={filters}
      />

      {/* Chips name what the collapsed popover is doing. Each is individually
          dismissable so undoing one filter never means reopening the popover. */}
      {filterChips.map((chip) => (
        <button
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-subtle)] pr-2 pl-2.5 text-xs font-medium whitespace-nowrap text-primary transition-colors hover:border-primary"
          key={chip.key}
          onClick={() => onRemoveChip(chip.key)}
          type="button"
        >
          {chip.label}
          <XIcon aria-hidden="true" className="size-3" strokeWidth={2} />
          <span className="sr-only">Remove filter</span>
        </button>
      ))}

      {filterChips.length > 0 && (
        <Button className="h-7 px-2 text-xs" onClick={onClearAll} size="sm" variant="ghost">
          Clear all
        </Button>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Sort tickets" className="h-8 gap-1.5 bg-card px-2.5 text-[13px] font-normal" size="sm" variant="outline">
              <ArrowUpDownIcon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              {SORT_LABELS[sort]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuRadioGroup onValueChange={(v) => onSortChange(v as TicketSort)} value={sort}>
              {(Object.keys(SORT_LABELS) as TicketSort[]).map((key) => (
                <DropdownMenuRadioItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Choose columns" className="size-8 bg-card" size="icon" variant="outline">
              <Columns3Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {HIDEABLE_QUEUE_COLUMNS.map((column) => (
              <DropdownMenuCheckboxItem
                checked={isColumnVisible(columnVisibility, column.key)}
                key={column.key}
                onCheckedChange={() => onToggleColumn(column.key)}
                onSelect={(e) => e.preventDefault()}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Row density" className="size-8 bg-card" size="icon" variant="outline">
              <Rows3Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuRadioGroup onValueChange={(v) => onDensityChange(v as QueueDensity)} value={density}>
              <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
