import { getUrgencyBadgeConfig, getUrgencyBandStyle } from "@/lib/utils/ui/urgency";

// The Urgency column: a 44px meter with the raw score stacked underneath it.
//
// The fill color comes from getUrgencyBandStyle(label).hex, where `label` is
// getUrgencyBadgeConfig's own label — NOT an independent threshold check. That
// indirection is deliberate: the meter, the score's text color and the Level
// badge beside it all resolve from one getUrgencyBadgeConfig call, so a row can
// never show a red meter next to a "Medium" badge. See that helper's docblock.
//
// The meter is decorative-with-a-number, not a lone color channel: the score is
// always rendered with it, so the bar never carries meaning on its own
// (docs/design-system.md §7 bans color-only meaning).
//
// The wrapper is pinned to w-11 — the bar's own width — so items-center
// centers the score under the bar itself. Centering the pair inside the 96px
// track is the cell's job (QueueRow's justify-center, paired with the column's
// align: "center" for the header), not this component's.
//
// Stacked rather than side-by-side, so the 3px gap and leading-none on the
// score keep the pair at ~20px — inside the 22px of content a Comfortable
// (9px padding) or Compact (5px) row has before it grows past the 40px/32px
// bounds docs/design-system.md §5.5 sets for admin table rows.
export function UrgencyMeter({ priorityScore }: { priorityScore: number | null }) {
  const badge = getUrgencyBadgeConfig(priorityScore);
  const fill = getUrgencyBandStyle(badge.label).hex;
  const score = priorityScore ?? 0;

  return (
    <span className="flex w-11 flex-col items-center gap-[3px]">
      <span
        aria-hidden="true"
        className="block h-1 w-11 overflow-hidden rounded-full bg-[var(--color-meter-track)]"
      >
        {priorityScore !== null && (
          <span
            className="block h-1 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, score))}%`, background: fill }}
          />
        )}
      </span>
      <span
        className="font-mono text-[13px] leading-none font-semibold tabular-nums"
        // Only High gets a colored score. Medium/Low sit at --foreground so the
        // column does not read as three competing text colors at a glance.
        style={badge.level === "HIGH" ? { color: "var(--color-urgency-critical-ink)" } : undefined}
      >
        {priorityScore ?? "—"}
      </span>
    </span>
  );
}
