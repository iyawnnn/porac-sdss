import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminManagementSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading admin management" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      <Card>
        <CardHeader className="border-b py-3">
          <div className="grid w-full grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton className="h-3 w-full" key={index} />
            ))}
          </div>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {Array.from({ length: 5 }).map((_, row) => (
            <div className="grid grid-cols-5 items-center gap-4 px-4 py-3" key={row}>
              {Array.from({ length: 5 }).map((_, col) => (
                <Skeleton className="h-4 w-full max-w-24" key={col} />
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
