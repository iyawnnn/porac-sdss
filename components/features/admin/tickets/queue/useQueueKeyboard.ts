"use client";

import { useEffect, useState } from "react";

// J/K to move, X to select, Enter to open -- the mail-client convention, which
// is what the design's footer legend advertises.
//
// The handler bails on any event originating inside a text field, a
// contenteditable, or with a modifier held. Without that, typing "jak" into the
// queue's search box would move the focus ring three times and select a row --
// and the search box is the single most-used control on the page.
export function useQueueKeyboard({
  ids,
  onToggleSelect,
  onOpen,
  enabled = true,
}: {
  ids: number[];
  onToggleSelect: (id: number) => void;
  onOpen: (id: number) => void;
  enabled?: boolean;
}) {
  const [rawFocusedId, setFocusedId] = useState<number | null>(null);

  // A focused row that filtering or paging removed must not keep the ring, and
  // must not be what Enter opens. Derived during render rather than pruned in
  // an effect: an effect would render one frame with a ring on a row that is no
  // longer there, and setState inside an effect body cascades renders.
  const focusedId = rawFocusedId !== null && ids.includes(rawFocusedId) ? rawFocusedId : null;

  useEffect(() => {
    if (!enabled) return;

    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (ids.length === 0) return;

      const key = event.key.toLowerCase();
      if (key !== "j" && key !== "k" && key !== "x" && event.key !== "Enter") return;

      const currentIndex = focusedId === null ? -1 : ids.indexOf(focusedId);

      if (key === "j" || key === "k") {
        event.preventDefault();
        const nextIndex =
          key === "j"
            ? Math.min(ids.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex <= 0 ? 0 : currentIndex - 1);
        const nextId = ids[nextIndex];
        setFocusedId(nextId);
        document
          .querySelector(`[data-ticket-row="${nextId}"]`)
          ?.scrollIntoView({ block: "nearest" });
        return;
      }

      if (focusedId === null) return;
      event.preventDefault();
      if (key === "x") onToggleSelect(focusedId);
      else onOpen(focusedId);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, ids, focusedId, onToggleSelect, onOpen]);

  return { focusedId, setFocusedId };
}
