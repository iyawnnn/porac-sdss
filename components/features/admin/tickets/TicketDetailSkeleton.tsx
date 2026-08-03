import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function TicketDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading ticket detail" className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-96 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div className="flex flex-1 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" key={i} />
            ))}
          </div>
          <Skeleton className="h-9 w-36 shrink-0" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-7">
          <Card>
            <CardContent className="p-4">
              <Skeleton className="h-72 w-full rounded-lg" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-4 w-40" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Skeleton className="h-40 w-full rounded-lg" />
                <Skeleton className="h-40 w-full rounded-lg" />
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card>
            <CardContent className="p-4">
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
