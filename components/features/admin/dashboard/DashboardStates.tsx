import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";

function TableSkeleton() { return <div className="divide-y">{Array.from({ length: 5 }).map((_, index) => <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2" key={index}><Skeleton className="h-4 w-2/5" /><Skeleton className="h-4 w-12" /></div>)}</div>; }
function KpiRowSkeleton() { return <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <Card className="py-0" key={index}><CardContent className="space-y-2 p-4"><Skeleton className="h-7 w-16" /><Skeleton className="h-3 w-24" /><Skeleton className="h-8 w-full" /></CardContent></Card>)}</div>; }
function RailSkeleton() { return <Card className="flex flex-col dashboard:col-span-3"><CardHeader className="space-y-2"><Skeleton className="h-5 w-32" /></CardHeader><CardContent className="flex flex-1 flex-col divide-y divide-line-100 p-0">{Array.from({ length: 4 }).map((_, index) => <div className="flex items-center gap-3 px-3 py-3" key={index}><Skeleton className="size-4 shrink-0 rounded-full" /><div className="min-w-0 flex-1 space-y-1"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-4 w-8 shrink-0" /></div>)}</CardContent></Card>; }

export function DashboardSkeleton() { return <div aria-busy="true" aria-label="Loading operations dashboard" className="flex min-w-0 flex-col gap-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-2"><Skeleton className="h-7 w-64" /><Skeleton className="h-4 w-80 max-w-full" /></div><Skeleton className="h-8 w-56" /></div><div className="grid min-w-0 grid-cols-1 gap-3 dashboard:grid-cols-10 dashboard:items-start"><div className="flex min-w-0 flex-col gap-3 dashboard:col-span-7"><KpiRowSkeleton /><Card><CardHeader className="space-y-2"><Skeleton className="h-8 w-24" /><Skeleton className="h-4 w-64 max-w-full" /></CardHeader><CardContent><Skeleton className="h-60 w-full" /></CardContent></Card></div><RailSkeleton /></div><Card><CardHeader className="space-y-2"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-64 max-w-full" /></CardHeader><CardContent className="p-0"><TableSkeleton /></CardContent></Card></div>; }
export function DashboardError({ detail }: { detail?: string }) {
  return (
    <AdminErrorCard
      detail={detail}
      message={"The operations dashboard couldn't load live data from the API. Ticket Queue and the Interactive Map are unaffected — try reloading this page in a moment."}
      title="Dashboard Data Unavailable"
    />
  );
}
