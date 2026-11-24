"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// A failed server section keeps its own frame and message, so a failed request never reads as zero reports
// and never takes down the sections that did load. Retry re-runs the server render.
export function SectionError({ title, message, className }: { title: string; message: string; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <div className={cn("flex items-center rounded-xl border border-border bg-card p-5", className)}>
      <Alert variant="destructive" className="border-0 bg-transparent p-0">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="flex flex-col items-start">
          <p>{message}</p>
          <Button
            variant="outline"
            onClick={() => startTransition(() => router.refresh())}
            disabled={pending}
            aria-busy={pending}
            className="mt-3 h-9 gap-2 px-3 text-foreground active:not-aria-[haspopup]:translate-y-0"
          >
            Try again
            {pending && <Spinner aria-label="Retrying" />}
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
