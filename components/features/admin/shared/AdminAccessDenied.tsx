import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { EmptyState } from "./EmptyState";

export function AdminAccessDenied() {
  return (
    <section role="alert">
      <EmptyState
        icon={LockKeyhole}
        title="You don't have access to this page."
        action={
          <Link className="text-sm font-medium text-primary hover:underline" href="/admin">
            Back to home
          </Link>
        }
      />
    </section>
  );
}
