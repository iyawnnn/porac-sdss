import type { ReactNode } from "react";

// Plain title+icon row. It has no background or border of its own — it
// sits directly on the dashboard card's own gray (--muted) fill, which is
// the actual "header tab" look (see CardBodyPanel, the white inset panel
// that makes the gray read as a frame around the rest of the card). The
// first version of this tried to fake the gray as a strip breaking out of
// a white card via negative margins tied to the card's padding value —
// that broke the moment the padding value it assumed (1rem) didn't match
// what these cards actually use (py-5 = 1.25rem), leaving a visible sliver
// of white at the top. Making the card itself gray removes that dependency
// entirely.
export function CardHeaderRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-2">{children}</div>;
}
