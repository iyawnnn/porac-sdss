import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { apiGetOptional } from "@/lib/api-client";
import type { FocalIntakeDetail as FocalIntakeDetailData } from "@/lib/types/admin-focal-intake";
import type { RelatedTicketCandidates } from "@/lib/types/admin-related-tickets";
import type { CorrectionAvailability } from "@/lib/types/admin-ticket-corrections";
import { EmptyState } from "@/components/features/admin/shared/EmptyState";
import { FocalIntakeDetail } from "@/components/features/admin/focal/FocalIntakeDetail";

export default async function FocalIntakeDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const report = await apiGetOptional<FocalIntakeDetailData>(`/admin/intake/${reportId}`, [401, 404]);

  if (!report) {
    return (
      <div className="mx-auto w-full max-w-lg min-w-0 flex-1 py-16">
        <EmptyState
          action={
            <Link className="text-sm font-medium text-primary hover:underline" href="/admin/focal/intake">
              Back to Intake Queue
            </Link>
          }
          description={`No report matches "${reportId}".`}
          icon={SearchXIcon}
          title="Report not found"
        />
      </div>
    );
  }

  // Suggested related tickets for this report's ticket (manuscript revision
  // Phase 3, step 3c), fetched on their own so a failure only affects that
  // panel.
  let related: RelatedTicketCandidates | null = null;
  try {
    related = await apiGetOptional<RelatedTicketCandidates>(`/admin/intake/${reportId}/related-candidates`, [401, 404]);
  } catch {
    related = null;
  }

  // Category and location correction of the report's ticket (manuscript
  // revision Phase 3, step 3e); a failure only hides the two buttons.
  let correction: CorrectionAvailability | null = null;
  try {
    correction = await apiGetOptional<CorrectionAvailability>(`/admin/ticket-corrections/${report.ticketId}`, [401, 403, 404]);
  } catch {
    correction = null;
  }

  return <FocalIntakeDetail correction={correction} related={related} report={report} />;
}
