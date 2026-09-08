import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { apiGetOptional } from "@/lib/api-client";
import type { FocalIntakeDetail as FocalIntakeDetailData } from "@/lib/types/admin-focal-intake";
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

  return <FocalIntakeDetail report={report} />;
}
