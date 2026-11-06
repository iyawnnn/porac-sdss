"use client";

import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { fetchExport } from "@/lib/utils/download-export";

export function ExportDownload({ href, children, ...props }: {
  href: string;
} & ComponentProps<typeof Button>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button {...props} asChild disabled={busy}>
        <a href={href} aria-disabled={busy} onClick={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          try {
            const { blob, filename } = await fetchExport(href);
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not download export. Try again.");
          } finally { setBusy(false); }
        }}>{children}</a>
      </Button>
      {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
    </span>
  );
}
