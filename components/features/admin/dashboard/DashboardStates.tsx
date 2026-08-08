import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";

function TableSkeleton() { return <div className="divide-y">{Array.from({ length: 5 }).map((_, index) => <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2" key={index}><Skeleton className="h-4 w-2/5" /><Skeleton className="h-4 w-12" /></div>)}</div>; }
function DonutSkeleton() { return <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-4 @sm:flex-row"><Skeleton className="size-44 rounded-full" /><div className="grid w-full max-w-44 gap-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-4 w-full" key={index} />)}</div></div>; }
function DepartmentSkeleton() { return <div className="grid flex-1 grid-cols-1 sm:grid-cols-2"><div className="flex flex-col items-center justify-center gap-3 border-b p-4 sm:border-r sm:border-b-0"><Skeleton className="h-4 w-16" /><Skeleton className="size-28 rounded-full" /><Skeleton className="h-6 w-12" /></div><div className="flex flex-col items-center justify-center gap-3 p-4"><Skeleton className="h-4 w-16" /><Skeleton className="size-28 rounded-full" /><Skeleton className="h-6 w-12" /></div></div>; }
function OfficePerformanceSkeleton() { return <Card className="dashboard:col-span-4"><CardHeader className="space-y-2"><Skeleton className="h-5 w-56" /></CardHeader><CardContent><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton className="h-16 w-full" key={index} />)}</div></CardContent></Card>; }

export function DashboardSkeleton() { return <div aria-busy="true" aria-label="Loading operations dashboard" className="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-2 dashboard:grid-cols-4"><Card className="lg:col-span-2 dashboard:col-span-3"><CardHeader className="space-y-2"><Skeleton className="h-8 w-24" /><Skeleton className="h-4 w-64 max-w-full" /></CardHeader><CardContent><Skeleton className="h-60 w-full" /></CardContent></Card><Card className="lg:col-span-2 dashboard:col-span-1"><CardHeader className="space-y-2"><Skeleton className="h-8 w-20" /><Skeleton className="h-4 w-36" /></CardHeader><CardContent className="p-0"><DonutSkeleton /></CardContent></Card>{Array.from({ length: 2 }).map((_, index) => <Card className="flex h-full dashboard:col-span-2" key={index}><CardHeader className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-64 max-w-full" /></CardHeader><CardContent className="p-0"><TableSkeleton /></CardContent></Card>)}<OfficePerformanceSkeleton /><section aria-label="Loading dashboard analytics" className="grid min-w-0 grid-cols-1 gap-4 lg:col-span-2 lg:grid-cols-2 dashboard:col-span-4 dashboard:grid-cols-3">{[DonutSkeleton, DonutSkeleton, DepartmentSkeleton].map((Body, index) => <Card className="flex h-full flex-col" key={index}><CardHeader className="space-y-2 border-b pt-3 pb-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-52 max-w-full" /></CardHeader><CardContent className="flex flex-1 p-0"><Body /></CardContent></Card>)}</section></div>; }
export function DashboardError({ detail }: { detail?: string }) {
  return (
    <AdminErrorCard
      detail={detail}
      message={"The operations dashboard couldn't load live data from the API. Ticket Queue and the Interactive Map are unaffected \u2014 try reloading this page in a moment."}
      title="Dashboard Data Unavailable"
    />
  );
}
