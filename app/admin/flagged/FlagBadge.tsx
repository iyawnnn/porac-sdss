import { getFlagCategory } from "@/lib/admin/flagRisk";

export function FlagBadge({ flag }: { flag: string }) {
  const category = getFlagCategory(flag);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${category.className}`}
    >
      {category.label}
    </span>
  );
}
