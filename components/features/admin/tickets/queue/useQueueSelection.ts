"use client";

import { useCallback, useMemo, useState } from "react";

export type HeaderCheckboxState = boolean | "indeterminate";

// Selection is scoped to the ids currently on screen. Every consumer prunes
// against the visible row ids, so a ticket cannot stay silently selected after
// a filter change or a page turn and then be swept into a bulk action the admin
// can no longer see. That pruning is what keeps the bulk bar's count honest and
// what keeps a selection under the server's 50-id cap (the largest page is 50).
export function useQueueSelection(visibleIds: number[]) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const selectedIds = useMemo(
    () => visibleIds.filter((id) => selected.has(id)),
    [visibleIds, selected],
  );

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  // Header checkbox semantics: "some selected" toggles to all, "all selected"
  // toggles to none -- never a third state the user has to click twice through.
  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  }, [visibleIds]);

  const headerState: HeaderCheckboxState =
    selectedIds.length === 0
      ? false
      : selectedIds.length === visibleIds.length
        ? true
        : "indeterminate";

  return { selectedIds, isSelected: (id: number) => selected.has(id), toggle, toggleAll, clear, headerState };
}
