"use client";

import { Columns3Icon, Rows3Icon, SearchIcon, XIcon } from "lucide-react";
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
  HIDEABLE_FLAGGED_COLUMNS,
  isColumnVisible,
  type FlaggedColumnKey,
  type FlaggedColumnVisibility,
  type FlaggedDensity,
} from "./columns";
import { FlaggedFiltersPopover, type FlaggedFilterValues } from "./FlaggedFiltersPopover";

export interface FilterChip {
  key: string;
  label: string;
}

interface Barangay {
  id: number;
  name: string;
}

// There is deliberately no sort control here, unlike the Ticket Queue's.
// GET /admin/moderation has one ORDER BY (r.created_at DESC) and accepts no
// sort param, so a picker would either do nothing or imply an ordering the
// server cannot produce. The Ticket Queue offers one because parseTicketQuery
// actually parses it.
export function FlaggedToolbar({
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
  columnVisibility,
  onToggleColumn,
  density,
  onDensityChange,
}: {
  searchInput: string;
  onSearchInput: (value: string) => void;
  filters: FlaggedFilterValues;
  filterChips: FilterChip[];
  activeFilterCount: number;
  barangays: Barangay[];
  isSystemAdmin: boolean;
  sessionOffice?: string;
  onFilterChange: (patch: Partial<FlaggedFilterValues>) => void;
  onRemoveChip: (key: string) => void;
  onClearAll: () => void;
  columnVisibility: FlaggedColumnVisibility;
  onToggleColumn: (key: FlaggedColumnKey) => void;
  density: FlaggedDensity;
  onDensityChange: (density: FlaggedDensity) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-3.5 py-2.5">
      <div className="relative w-full max-w-[340px] min-w-[200px] flex-1">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search flagged reports"
          className="h-8 bg-card pl-8 text-[13px]"
          onChange={(e) => onSearchInput(e.target.value)}
          placeholder="Title or citizen name"
          type="search"
          value={searchInput}
        />
      </div>

      <FlaggedFiltersPopover
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
          Reset filters
        </Button>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Choose columns" className="size-8 bg-card" size="icon" variant="outline">
              <Columns3Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {HIDEABLE_FLAGGED_COLUMNS.map((column) => (
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
            <DropdownMenuRadioGroup
              onValueChange={(v) => onDensityChange(v as FlaggedDensity)}
              value={density}
            >
              <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
