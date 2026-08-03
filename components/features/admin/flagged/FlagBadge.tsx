import { getFlagCategory } from "@/lib/utils/flag-risk";
import { Badge } from "@/components/ui/badge";

export function FlagBadge({ flag }: { flag: string }) {
  const category = getFlagCategory(flag);
  return (
    <Badge className={category.className} variant="outline">
      {category.label}
    </Badge>
  );
}
