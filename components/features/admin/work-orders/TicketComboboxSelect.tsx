"use client";

import { useEffect, useState } from "react";
import { ChevronsUpDown, Loader2 } from "lucide-react";
import type { AdminTicketRow } from "@/lib/types/admin-tickets";
import type { PaginatedTickets } from "@/lib/types/admin-tickets";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import styles from "./TicketComboboxSelect.module.css";

function UrgencyBadge({ priorityScore }: { priorityScore: number | null }) {
  const badge = getUrgencyBadgeConfig(priorityScore);
  return (
    <span className={`inline-flex h-5 items-center rounded-md px-2 text-[11px] font-semibold tracking-[0.02em] whitespace-nowrap ${badge.className}`}>
      {badge.label}
    </span>
  );
}

// Reuses GET /admin/tickets (the same server-side search/pagination/office-
// scoping backing the main Ticket Queue) instead of a new endpoint — status
// already defaults to "active", so Resolved/Rejected are excluded for free.
export function TicketComboboxSelect({
  value,
  onChange,
}: {
  value: AdminTicketRow | null;
  onChange: (ticket: AdminTicketRow) => void;
}) {
  // Renders the popover's portal into a node inside this dialog's own DOM
  // subtree instead of Radix's default document.body target. When opened
  // from CreateWorkOrderDialog, a body-level portal sits outside the modal
  // Dialog's RemoveScroll shard, so Radix can't tell the ticket list is
  // scrollable and blocks wheel/trackpad input over it (drag-to-scroll still
  // works since it isn't gated by that check). `contents` keeps this wrapper
  // out of layout entirely; state (not a ref read during render) is how
  // React expects a DOM node from your own tree to be threaded elsewhere.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminTicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(false);
      const params = new URLSearchParams({ status: "active", limit: "10" });
      if (query.trim()) params.set("search", query.trim());
      fetch(`/api/admin/tickets?${params}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data: PaginatedTickets) => {
          if (!cancelled) setResults(data.tickets);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  return (
    <div className="contents" ref={setContainer}>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-expanded={open}
            className="w-full justify-between font-normal"
            role="combobox"
            type="button"
            variant="outline"
          >
            {value ? (
              <span className="truncate">
                #{value.id} · {value.category}
              </span>
            ) : (
              <span className="text-muted-foreground">Search for a ticket…</span>
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" container={container}>
          <Command shouldFilter={false}>
            <CommandInput
              onValueChange={setQuery}
              placeholder="Search by ID, category, or barangay…"
              value={query}
            />
            <CommandList className={`${styles.scrollViewport} max-h-[min(20rem,45vh)] pr-1`}>
              {loading && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Searching…
                </div>
              )}
              {!loading && error && (
                <div className="py-6 text-center text-sm text-destructive">Could not load tickets. Try again.</div>
              )}
              {!loading && !error && <CommandEmpty>No eligible tickets found.</CommandEmpty>}
              {!loading && !error && (
                <CommandGroup>
                  {results.map((ticket) => (
                    <CommandItem
                      data-checked={value?.id === ticket.id}
                      key={ticket.id}
                      onSelect={() => {
                        onChange(ticket);
                        setOpen(false);
                      }}
                      value={String(ticket.id)}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-medium">
                          #{ticket.id} · {ticket.category}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="truncate">{ticket.barangay_name}</span>
                          <UrgencyBadge priorityScore={ticket.priority_score} />
                          <span>{ticket.assigned_office}</span>
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
