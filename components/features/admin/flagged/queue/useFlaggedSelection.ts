"use client";

import { useCallback, useMemo, useState } from "react";

export type HeaderCheckboxState = boolean | "indeterminate";

// Selection is scoped to the report ids currently on screen: selectedIds is
// derived by filtering the visible ids, so a report cannot stay silently
// selected after a filter change or a page turn and then be swept into a bulk
// moderation the admin can no longer see. That matters more here than on the
// Ticket Queue — a stale selection here can quarantine reports, which hides
// them from the public map immediately.
export function useFlaggedSelection(visibleIds: number[]) {
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
  // toggles to none — never a third state the user clicks twice through.
  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [visibleIds]);

  const headerState: HeaderCheckboxState =
    selectedIds.length === 0
      ? false
      : selectedIds.length === visibleIds.length
        ? true
        : "indeterminate";

  return {
    selectedIds,
    isSelected: (id: number) => selected.has(id),
    toggle,
    toggleAll,
    clear,
    headerState,
  };
}
