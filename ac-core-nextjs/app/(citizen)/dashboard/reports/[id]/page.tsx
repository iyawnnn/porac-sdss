import { notFound } from "next/navigation";
import Link from "next/link";
import { getCitizenSession } from "@/lib/auth/getCitizenSession";
import { getMyReportDetail } from "@/lib/citizens/reports";
import StatusTimeline from "./StatusTimeline";

export default async function MyReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCitizenSession();
  // proxy.ts already redirects unauthenticated requests before this
  // renders; this null-check is just defense in depth.
  if (!session) return null;

  const { id } = await params;
  const data = await getMyReportDetail(session.citizenId, Number(id));

  if (!data) notFound();

  const { report, history } = data;

  return (
    <main className="max-w-2xl mx-auto p-6">
      <Link href="/dashboard" className="text-blue-600 underline text-sm">
        ← Back to my reports
      </Link>

      <h1 className="text-2xl font-bold mt-2 mb-6">{report.title}</h1>

      <div className="mb-8">
        <StatusTimeline
          currentStatus={report.status}
          ticketCreatedAt={report.ticket_created_at}
          history={history}
        />
      </div>

      <div className="border p-4 rounded flex gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={report.image_url} alt={report.title} className="w-32 h-32 object-cover rounded" />
        <div>
          <p className="text-sm text-gray-600">
            {report.category} · reported as {report.citizen_severity}
          </p>
          {report.description && <p className="text-sm mt-1">{report.description}</p>}
          <p className="text-xs text-gray-500 mt-2">
            Submitted {new Date(report.created_at).toLocaleString()}
          </p>
        </div>
      </div>
    </main>
  );
}
