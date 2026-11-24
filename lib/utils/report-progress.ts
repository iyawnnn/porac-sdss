// The citizen progress tracker (UI Phase 2C), derived only from what the ticket actually did: its
// current status and the statuses its history has entered. Nothing is filled in by assumption.
export const PROGRESS_STAGES = ["Reported", "Under Review", "In Progress", "Resolved"] as const;
export type ProgressStage = (typeof PROGRESS_STAGES)[number];

export type StageState =
  | "done" // entered, and the ticket has moved past it
  | "current" // where the ticket is now
  | "skipped" // before the current stage but never entered (staff moved straight past it)
  | "upcoming" // not reached yet
  | "rejected" // the stage the ticket left the workflow from (Not accepted)
  | "inactive"; // after a rejection: never going to be reached

export type Progress = { stages: { label: ProgressStage; state: StageState }[]; rejected: boolean };

export function reportProgress(status: string, reached: readonly string[]): Progress {
  const entered = new Set([...reached, "Reported"]); // every report starts as Reported
  if (status === "Rejected") {
    // All four stages stay visible. The last stage it really reached is where it exited (marked
    // rejected); earlier ones keep their real state; later ones are inactive, never "resolved".
    const exit = PROGRESS_STAGES.reduce((max, stage, i) => (entered.has(stage) && stage !== "Resolved" ? i : max), 0);
    return {
      rejected: true,
      stages: PROGRESS_STAGES.map((label, i) => ({
        label,
        state: i < exit ? (entered.has(label) ? "done" : "skipped") : i === exit ? "rejected" : "inactive",
      })),
    };
  }
  const current = PROGRESS_STAGES.indexOf(status as ProgressStage);
  return {
    rejected: false,
    stages: PROGRESS_STAGES.map((label, i) => ({
      label,
      state: i === current ? "current" : i > current ? "upcoming" : entered.has(label) ? "done" : "skipped",
    })),
  };
}
