import { EMERGENCY_NOTICE_BODY, EMERGENCY_NOTICE_TITLE } from "@/lib/utils/emergency-notice";

// Shown at the top of the citizen report form and the citizen dashboard
// (manuscript revision Phase 6, step 6a). Always visible: no dismiss
// control, the same layout at every width. No hooks, so it renders in both
// the server dashboard page and the client report form.
export function EmergencyNotice({ className = "" }: { className?: string }) {
  return (
    <div
      role="note"
      aria-labelledby="emergency-notice-title"
      data-testid="emergency-notice"
      className={`flex items-start gap-3 rounded-xl border border-warning-edge bg-warning-tint p-4 text-warning-ink ${className}`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-warning-ink"
      >
        <path
          d="M12 3.5 2.75 19.5h18.5L12 3.5Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path d="M12 10v4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1" fill="currentColor" />
      </svg>
      <div className="min-w-0">
        <p id="emergency-notice-title" className="text-sm font-semibold text-warning-ink">
          {EMERGENCY_NOTICE_TITLE}
        </p>
        <p className="mt-1 text-sm leading-5 text-warning-ink">{EMERGENCY_NOTICE_BODY}</p>
      </div>
    </div>
  );
}
