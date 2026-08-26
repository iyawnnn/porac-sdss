"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { FLAG_TYPES, MODERATION_STATUSES } from "@/lib/types/admin-moderation";
import { TICKET_CATEGORIES } from "@/lib/types/admin-ticket-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FLAG_TYPE_LABELS, moderationStatusLabel } from "../flagText";

export interface FlaggedFilterValues {
  office: string;
  status: string;
  category: string;
  barangayId: string;
  flag: string;
  from: string;
  to: string;
}

interface Barangay {
  id: number;
  name: string;
}

// The seven filters that used to sit permanently across the toolbar. Collapsing
// them costs one click per change and buys back the horizontal room the search
// box, the active-filter chips and the sort/columns/density cluster need at
// 1440px — this toolbar previously wrapped to two rows before any chip existed.
//
// The trigger carries the active count so the popover is never a black box, and
// the chips beside it name which filters are narrowing the list.
export function FlaggedFiltersPopover({
  values,
  activeCount,
  barangays,
  isSystemAdmin,
  sessionOffice,
  onChange,
}: {
  values: FlaggedFilterValues;
  activeCount: number;
  barangays: Barangay[];
  isSystemAdmin: boolean;
  sessionOffice?: string;
  onChange: (patch: Partial<FlaggedFilterValues>) => void;
}) {
  const sortedBarangays = [...barangays].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="h-8 gap-1.5 bg-card px-2.5 text-[13px]" size="sm" variant="outline">
          <SlidersHorizontalIcon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-subtle)] px-1 font-mono text-[10px] font-semibold text-primary">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        {/* Office is a real filter only for a system admin. An office admin is
            clamped by resolveOfficeScope server-side regardless of what is
            sent, so showing them a select they cannot change would be a lie —
            they get a static read-out of their own scope instead. */}
        {isSystemAdmin ? (
          <FilterField label="Office">
            <Select onValueChange={(v) => onChange({ office: v })} value={values.office}>
              <SelectTrigger aria-label="Office" className="w-full bg-card" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All offices</SelectItem>
                <SelectItem value="MEO">MEO</SelectItem>
                <SelectItem value="MDRRMO">MDRRMO</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
        ) : (
          <FilterField label="Office">
            <p className="text-[13px] text-muted-foreground">
              Scoped to <span className="font-mono">{sessionOffice}</span>
            </p>
          </FilterField>
        )}

        <FilterField label="Moderation status">
          <Select onValueChange={(v) => onChange({ status: v })} value={values.status}>
            <SelectTrigger aria-label="Moderation status" className="w-full bg-card" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending review</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
              {MODERATION_STATUSES.filter((s) => s !== "pending").map((s) => (
                <SelectItem key={s} value={s}>
                  {moderationStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Flag type">
          <Select
            onValueChange={(v) => onChange({ flag: v === "all" ? "" : v })}
            value={values.flag || "all"}
          >
            <SelectTrigger aria-label="Flag type" className="w-full bg-card" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All flag types</SelectItem>
              {FLAG_TYPES.map((f) => (
                <SelectItem key={f} value={f}>
                  {FLAG_TYPE_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Category">
          <Select
            onValueChange={(v) => onChange({ category: v === "all" ? "" : v })}
            value={values.category || "all"}
          >
            <SelectTrigger aria-label="Category" className="w-full bg-card" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {TICKET_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Barangay">
          <Select
            onValueChange={(v) => onChange({ barangayId: v === "all" ? "" : v })}
            value={values.barangayId || "all"}
          >
            <SelectTrigger aria-label="Barangay" className="w-full bg-card" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="min-w-56">
              <SelectItem value="all">All barangays</SelectItem>
              {sortedBarangays.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Submitted">
          <div className="flex items-center gap-1.5">
            <Input
              aria-label="Submitted from"
              className="h-8 bg-card text-[13px]"
              onChange={(e) => onChange({ from: e.target.value })}
              type="date"
              value={values.from}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              aria-label="Submitted to"
              className="h-8 bg-card text-[13px]"
              onChange={(e) => onChange({ to: e.target.value })}
              type="date"
              value={values.to}
            />
          </div>
        </FilterField>
      </PopoverContent>
    </Popover>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}
