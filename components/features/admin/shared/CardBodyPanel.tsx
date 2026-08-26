import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The white "main body" panel — inset 3px from the dashboard card's own
// gray (--muted) frame on the left, right, and bottom edges, flush against
// the header row at the top (no gap there; see CardHeaderRow). This is
// what actually produces the reference's look: the card's real background
// is gray throughout, and this panel is the thing that's inset, not a gray
// strip layered on top of an otherwise-white card.
//
// The gray gutter is 3px and runs on exactly three sides — left, right and
// bottom. NOT the top: the panel stays flush against the header row there,
// separated only by its own `border-t`, because the gray above the panel is
// the header band itself, not a frame edge. Widening `mx-`/`mb-` without
// keeping the top flush would turn the header into a floating strip and
// lose that read.
//
// `mx-[3px]` does the left/right sides directly. The bottom is indirect:
// only the card's *bottom* padding matters, and every dashboard card that
// uses this panel keeps it at `pb-5` (1.25rem = 20px) — see
// DashboardClient.tsx / NeedsAttention.tsx / DashboardStates.tsx.
// `mb-[-17px]` cancels 17 of those 20px, leaving the same 3px of gray at
// the bottom that `mx-[3px]` leaves at the sides. The two constants are a pair: for a gutter of width
// W they are `mx-[Wpx]` / `mb-[-(20-W)px]`. If a card's own *bottom*
// padding ever stops being 20px, the `mb-` value has to move with it —
// that coupling is real, but it's now the *only* place it lives (the
// header row itself carries no padding assumption at all), instead of
// being silently wrong the way the previous negative-margin header was.
//
// `rounded-[6px]` softens all four corners, including the top two even
// though the top edge is flush — the gray directly above the panel is the
// header band, so rounded top corners read as the panel tucking under the
// header rather than as a gap. 6px is deliberately NOT the concentric
// value: sitting 1px of card border + 3px of gutter inside the card's 12px
// `rounded-xl` would make it 8px, which traces the card's own curve
// exactly. 6px is the smaller, "just a little" softening that was asked
// for, and at this gutter width it is close enough to 8 that the bottom
// corners still read as even. If the corners ever need to nest perfectly
// inside the card, 8px is that number.
//
// Top padding is deliberately decoupled from all of the above: these cards
// use `pt-2` and pair it with `pb-2` on their CardHeader so the title/icon
// row sits vertically centered in the gray header band instead of flush
// against this panel's top border. The two must stay equal to each other —
// that equality IS the centering — so shrinking the header band means
// lowering both, never just one.
//
// Padding budget note: callers own ALL of their own internal spacing via
// `className` (pt/pb/px passed in per usage) — this component adds none of
// its own beyond the 3px inset. The first attempt at this panel doubled up
// spacing by adding padding here AND in the header, stacking to roughly
// 29px where the original design used ~12px total; keeping this component
// spacing-neutral makes that stacking bug structurally impossible to repeat.
export function CardBodyPanel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-[5px] mb-[-17px] overflow-hidden rounded-[6px] border-t border-border bg-card", className)}>{children}</div>;
}
