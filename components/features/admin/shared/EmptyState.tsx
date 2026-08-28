import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// One shared shape for every "nothing here" admin state, per
// docs/design-system.md §6 ("Empty states"): 20px muted icon, 14px title,
// 13px muted description, one optional action. Presentation-only — table
// structure (colSpan, TableCell/TableRow) stays with the caller, and the
// icon is optional since a couple of call sites are text-only.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 p-10 text-center", className)}>
      {Icon && <Icon aria-hidden="true" className="size-5 text-muted-foreground" />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
