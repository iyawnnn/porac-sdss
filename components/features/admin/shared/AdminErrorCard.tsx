import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AdminErrorCard({
  title,
  message,
  detail,
  onRetry,
}: {
  title: string;
  message: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <Card role="alert">
      <CardContent className="flex items-start gap-3 p-4">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          {detail && <p className="mt-2 font-mono text-xs text-muted-foreground">{detail}</p>}
          {onRetry && (
            <Button className="mt-3" onClick={onRetry} size="sm" variant="outline">
              Retry
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
