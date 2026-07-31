"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type MapMode = "pins" | "heatmap";

const OFFICE_OPTIONS = [
  { value: null, label: "All" },
  { value: "MEO", label: "MEO" },
  { value: "MDRRMO", label: "MDRRMO" },
] as const;

// Floating glass panel — deliberately kept as one-off arbitrary Tailwind
// utilities (backdrop-blur/opacity) rather than new @theme tokens: this
// translucent look is specific to floating map chrome, not the rest of
// the flat/opaque admin UI (DESIGN.md §2/§7).
export function MapControls({
  mode,
  onModeChange,
  showBoundaries,
  onToggleBoundaries,
}: {
  mode: MapMode;
  onModeChange: (mode: MapMode) => void;
  showBoundaries: boolean;
  onToggleBoundaries: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeOffice = searchParams.get("office");

  return (
    <div className="absolute top-4 right-4 z-[1000] w-52 space-y-3 rounded-xl border border-slate-200/60 bg-white/90 p-3 text-sm shadow-xl backdrop-blur-md">
      <section>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Layer</p>
        <div className="flex gap-1 rounded-lg bg-slate-100/80 p-1" role="group" aria-label="Map display mode">
          {(["pins", "heatmap"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onModeChange(item)}
              aria-pressed={mode === item}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                mode === item ? "bg-brand-500 text-white shadow-sm" : "text-ink-700 hover:bg-white"
              }`}
            >
              {item === "pins" ? "Pins" : "Heatmap"}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Boundaries</p>
        <button
          type="button"
          onClick={onToggleBoundaries}
          aria-pressed={showBoundaries}
          className={`w-full rounded-md px-2 py-1 text-left text-xs font-medium transition-colors ${
            showBoundaries ? "bg-brand-500 text-white shadow-sm" : "bg-slate-100/80 text-ink-700 hover:bg-slate-200/80"
          }`}
        >
          {showBoundaries ? "Shown" : "Hidden"}
        </button>
      </section>

      <section>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Office</p>
        <div className="flex gap-1 rounded-lg bg-slate-100/80 p-1">
          {OFFICE_OPTIONS.map((option) => {
            const isActive = option.value === null ? !activeOffice || activeOffice === "all" : activeOffice === option.value;
            const href = option.value === null ? `${pathname}?office=all` : `${pathname}?office=${option.value}`;
            return (
              <Link
                key={option.label}
                href={href}
                aria-current={isActive ? "true" : undefined}
                className={`flex-1 rounded-md px-2 py-1 text-center text-xs font-medium transition-colors ${
                  isActive ? "bg-brand-500 text-white shadow-sm" : "text-ink-700 hover:bg-white"
                }`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
