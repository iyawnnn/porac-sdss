import { getFlagCategory } from "@/lib/utils/flag-risk";
import { Badge } from "@/components/ui/badge";

// One definition of "what a flag looks like", at two scales.
//
// `default` is the shadcn Badge the Ticket Detail page has always rendered.
// `compact` is the tighter 20px/11px form the Flagged Reports queue needs to
// keep a row at 40px — a full-size Badge there pushes rows past the density
// bounds in docs/design-system.md §5.5. Both resolve their palette from the
// same getFlagCategory call, so the two surfaces can never disagree about
// which hue means "duplicate image".
export function FlagBadge({
  flag,
  size = "default",
}: {
  flag: string;
  size?: "default" | "compact";
}) {
  const category = getFlagCategory(flag);

  if (size === "compact") {
    return (
      <span
        className={`inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] font-medium whitespace-nowrap ${category.className}`}
      >
        {category.label}
      </span>
    );
  }

  return (
    <Badge className={category.className} variant="outline">
      {category.label}
    </Badge>
  );
}
