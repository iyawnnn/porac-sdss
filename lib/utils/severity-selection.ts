import type { Severity } from "./validation";

// The citizen report form's severity choice (manuscript revision Phase 3,
// step 3a). Choosing Critical selects it and asks the citizen to confirm;
// until they do, the form won't submit it. "Choose another level" (or
// closing the dialog) puts back the previous level, or none. Any change of
// level drops the confirmation, so choosing Critical again asks again.
// Form-only: the API accepts the same four values as before.
export interface SeveritySelection {
  severity: Severity | null;
  criticalConfirmed: boolean;
  // Set while the confirmation dialog is open: the level to put back if the
  // citizen chooses another level.
  confirming: { previous: Severity | null } | null;
}

export const NO_SEVERITY: SeveritySelection = { severity: null, criticalConfirmed: false, confirming: null };

export function chooseSeverity(state: SeveritySelection, next: Severity): SeveritySelection {
  if (next === state.severity) return state;
  if (next === "Critical") {
    return { severity: "Critical", criticalConfirmed: false, confirming: { previous: state.severity } };
  }
  return { severity: next, criticalConfirmed: false, confirming: null };
}

export function confirmCritical(state: SeveritySelection): SeveritySelection {
  if (!state.confirming) return state;
  return { severity: "Critical", criticalConfirmed: true, confirming: null };
}

export function chooseAnotherLevel(state: SeveritySelection): SeveritySelection {
  if (!state.confirming) return state;
  return { severity: state.confirming.previous, criticalConfirmed: false, confirming: null };
}

// Submitting must stop and ask first.
export function needsCriticalConfirmation(state: SeveritySelection): boolean {
  return state.severity === "Critical" && !state.criticalConfirmed;
}
