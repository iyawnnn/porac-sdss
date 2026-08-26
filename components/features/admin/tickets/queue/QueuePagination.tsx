"use client";

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { PAGE_LIMITS } from "@/lib/types/admin-ticket-constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...keep].sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push("ellipsis");
    result.push(p);
    prev = p;
  }
  return result;
}

// The footer sits INSIDE the table card rather than floating below it, so the
// row count, the keyboard legend and the pager all read as part of the same
// surface as the rows they describe.
//
// The keyboard legend is not decoration: J/K/X/Enter are live bindings
// (useQueueKeyboard), and an unlabelled keyboard shortcut is one nobody uses.
// It hides below lg where the shortcuts are least likely to be used and the
// room is needed for the pager.
export function QueuePagination({
  from,
  to,
  total,
  page,
  totalPages,
  limit,
  onPageChange,
  onLimitChange,
}: {
  from: number;
  to: number;
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-[var(--color-surface-subtle)] px-3.5 py-2.5">
      <div className="flex items-center gap-3.5">
        <span className="text-xs text-muted-foreground">
          {total === 0 ? (
            "No tickets"
          ) : (
            <>
              Showing <span className="font-mono tabular-nums text-foreground">{from}&ndash;{to}</span> of{" "}
              <span className="font-mono tabular-nums text-foreground">{total.toLocaleString()}</span>
            </>
          )}
        </span>
        <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground lg:flex">
          <Kbd className="h-4 min-w-4 rounded border border-border bg-card px-1 font-mono text-[10px]">J</Kbd>
          <Kbd className="h-4 min-w-4 rounded border border-border bg-card px-1 font-mono text-[10px]">K</Kbd>
          move
          <Kbd className="h-4 min-w-4 rounded border border-border bg-card px-1 font-mono text-[10px]">X</Kbd>
          select
          <Kbd className="h-4 min-w-4 rounded border border-border bg-card px-1 font-mono text-[10px]">&crarr;</Kbd>
          open
        </span>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-2 text-xs transition-colors hover:bg-muted"
              type="button"
            >
              {limit} / page
              <ChevronDownIcon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuRadioGroup onValueChange={(v) => onLimitChange(Number(v))} value={String(limit)}>
              {PAGE_LIMITS.map((option) => (
                <DropdownMenuRadioItem key={option} value={String(option)}>
                  {option} / page
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <nav aria-label="Ticket queue pages" className="flex items-center gap-0.5">
          <PagerButton
            disabled={page <= 1}
            label="Previous page"
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeftIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </PagerButton>

          {getPageNumbers(page, Math.max(1, totalPages)).map((entry, index) =>
            entry === "ellipsis" ? (
              <span
                aria-hidden="true"
                className="flex size-7 items-center justify-center text-xs text-muted-foreground"
                key={`ellipsis-${index}`}
              >
                &hellip;
              </span>
            ) : (
              <button
                aria-current={entry === page ? "page" : undefined}
                className={`flex size-7 items-center justify-center rounded-lg font-mono text-xs tabular-nums transition-colors ${
                  entry === page
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                key={entry}
                onClick={() => onPageChange(entry)}
                type="button"
              >
                {entry}
              </button>
            ),
          )}

          <PagerButton
            disabled={page >= totalPages}
            label="Next page"
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRightIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </PagerButton>
        </nav>
      </div>
    </div>
  );
}

function PagerButton({
  disabled,
  label,
  onClick,
  children,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
