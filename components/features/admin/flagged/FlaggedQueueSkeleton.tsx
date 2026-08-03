import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function FlaggedQueueSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading flagged reports" className="flex min-w-0 flex-col gap-3">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton className="h-16 w-full" key={index} />
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton className="h-8 w-28" key={index} />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b py-3">
          <div className="grid w-full grid-cols-7 gap-4">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton className="h-3 w-full" key={index} />
            ))}
          </div>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {Array.from({ length: 8 }).map((_, row) => (
            <div className="grid grid-cols-7 items-center gap-4 px-4 py-3" key={row}>
              {Array.from({ length: 7 }).map((_, col) => (
                <Skeleton className="h-4 w-full max-w-24" key={col} />
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
