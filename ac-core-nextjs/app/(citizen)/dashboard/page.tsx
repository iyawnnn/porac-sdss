import Link from "next/link";
import { getCitizenSession } from "@/lib/auth/getCitizenSession";
import { getMyReports } from "@/lib/citizens/reports";

const STATUS_CLASSES: Record<string, string> = {
  Reported: "bg-gray-100 text-gray-800",
  "Under Review": "bg-amber-100 text-amber-800",
  "In Progress": "bg-blue-100 text-blue-800",
  Resolved: "bg-green-100 text-green-800",
};

export default async function DashboardPage() {
  const session = await getCitizenSession();
  // proxy.ts already redirects unauthenticated requests before this
  // renders; this null-check is just defense in depth.
  if (!session) return null;

  const reports = await getMyReports(session.citizenId);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">My Reports</h1>
        <Link href="/report" className="text-blue-600 underline text-sm">
          + Report a hazard
        </Link>
      </div>

      <div className="space-y-4">
        {reports.map((r) => (
          <div key={r.id} className="border p-4 rounded flex gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.image_url} alt={r.title} className="w-24 h-24 object-cover rounded" />
            <div>
              <h2 className="font-medium">{r.title}</h2>
              <p className="text-sm text-gray-600">
                {r.category} · reported as {r.citizen_severity}
              </p>
              <p className="text-sm mt-1">
                Status:{" "}
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    STATUS_CLASSES[r.status] ?? "bg-gray-100 text-gray-800"
                  }`}
                >
                  {r.status}
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-1">{new Date(r.created_at).toLocaleString()}</p>
            </div>
          </div>
        ))}
        {reports.length === 0 && (
          <p className="text-gray-500">No reports yet. File one from the map.</p>
        )}
      </div>
    </main>
  );
}
