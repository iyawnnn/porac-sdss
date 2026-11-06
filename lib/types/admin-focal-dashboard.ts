import type { FocalIntakeRow } from './admin-focal-intake';

export interface FocalDashboardCounts {
  newReports: number;
  unacknowledged: number;
  needsScreening: number;
  forwardedOrEscalated: number;
  medianAcknowledgmentHours30d: number | null;
}

export interface FocalDashboardReports {
  items: Pick<FocalIntakeRow, 'reportId' | 'reportReference' | 'category' | 'barangayName' | 'routedOffice' | 'operationalPriority' | 'submittedAt' | 'intakeState' | 'needsScreening'>[];
  total: number;
  page: number;
  pageSize: number;
}
