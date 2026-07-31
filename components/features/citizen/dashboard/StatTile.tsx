export function StatTile({
  label,
  value,
  caption,
  note,
  tint,
  ink,
}: {
  label: string;
  value: number;
  caption: string;
  note: string;
  tint: string;
  ink: string;
}) {
  return (
    <div className="rounded-xl border border-line-200 bg-surface p-5">
      <span
        className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em]"
        style={{ background: tint, color: ink }}
      >
        {label}
      </span>
      <p className="mt-3 font-mono text-[28px] font-medium leading-[32px] tabular-nums text-ink-900">{value}</p>
      <p className="mt-1.5 text-[14px] font-medium text-ink-700">{caption}</p>
      <p className="mt-1 text-[12px] leading-[16px] text-ink-500">{note}</p>
    </div>
  );
}
