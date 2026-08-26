"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { TICKET_CATEGORIES, TICKET_STATUSES } from "@/lib/types/admin-ticket-constants";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface QueueFilterValues {
  office: string;
  status: string;
  category: string;
  barangayId: string;
  urgency: string;
  disputed: boolean;
}

interface Barangay {
  id: number;
  name: string;
}

// The seven filters that used to sit permanently across the toolbar. Collapsing
// them costs one click per change and buys back the horizontal room the search
// box, the active-filter chips and the sort/columns/density cluster need at
// 1440px — the toolbar previously wrapped to two rows before any chip existed.
//
// The trigger carries the active count so the popover is never a black box: an
// admin can always see that two filters are narrowing the list without opening
// it, and the chips beside it name which two.
export function QueueFiltersPopover({
  values,
  activeCount,
  barangays,
  isSystemAdmin,
  sessionOffice,
  onChange,
}: {
  values: QueueFilterValues;
  activeCount: number;
  barangays: Barangay[];
  isSystemAdmin: boolean;
  sessionOffice?: string;
  onChange: (patch: Partial<QueueFilterValues>) => void;
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
            clamped by resolveOfficeScope server-side regardless of what is sent,
            so showing them a select they cannot change would be a lie — they get
            a static read-out of their own scope instead. */}
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
            {/* Carries an aria-label so it is addressable by the same name as
                the system admin's Select, and keeps the "My Office:" wording the
                sidebar footer uses. An office admin is clamped by
                resolveOfficeScope server-side no matter what is sent, so showing
                them a control they cannot change would be a lie. */}
            <p aria-label="Office" className="text-[13px] text-muted-foreground" role="note">
              My Office: {sessionOffice ?? "unassigned"}
            </p>
          </FilterField>
        )}

        <FilterField label="Status">
          <Select onValueChange={(v) => onChange({ status: v })} value={values.status}>
            <SelectTrigger aria-label="Status" className="w-full bg-card" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active (Open)</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
              {TICKET_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Category">
          <Select onValueChange={(v) => onChange({ category: v === "all" ? "" : v })} value={values.category || "all"}>
            <SelectTrigger aria-label="Category" className="w-full bg-card" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {TICKET_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Barangay">
          <Select onValueChange={(v) => onChange({ barangayId: v === "all" ? "" : v })} value={values.barangayId || "all"}>
            <SelectTrigger aria-label="Barangay" className="w-full bg-card" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All barangays</SelectItem>
              {sortedBarangays.map((barangay) => (
                <SelectItem key={barangay.id} value={String(barangay.id)}>
                  {barangay.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Hazard urgency">
          <Select onValueChange={(v) => onChange({ urgency: v === "all" ? "" : v })} value={values.urgency || "all"}>
            <SelectTrigger aria-label="Hazard Urgency" className="w-full bg-card" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="High">High</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <Button
          className={values.disputed ? "w-full" : "w-full bg-card"}
          onClick={() => onChange({ disputed: !values.disputed })}
          size="sm"
          variant={values.disputed ? "default" : "outline"}
        >
          {values.disputed ? "Showing disputed only" : "Disputed only"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// The visible label is duplicated as an aria-label on the control itself so
// both screen readers and Playwright can address it by name; aria-hidden here
// keeps it from being announced twice.
function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p aria-hidden="true" className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
