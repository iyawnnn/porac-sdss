"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AssignmentPanel({
  ticketId,
  currentOffice,
}: {
  ticketId: number;
  currentOffice: string;
}) {
  const router = useRouter();
  const [target, setTarget] = useState(currentOffice);
  const [reassigning, setReassigning] = useState(false);
  const [error, setError] = useState("");

  async function handleReassign() {
    if (target === currentOffice) return;
    setReassigning(true);
    setError("");

    const res = await fetch(`/api/admin/tickets/${ticketId}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toOffice: target }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error ?? "Reassign failed");
    }
    setReassigning(false);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Select onValueChange={setTarget} value={target}>
          <SelectTrigger aria-label="Assigned office" className="flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="MEO">MEO</SelectItem>
            <SelectItem value="MDRRMO">MDRRMO</SelectItem>
          </SelectContent>
        </Select>
        <Button disabled={reassigning || target === currentOffice} onClick={handleReassign} size="sm" variant="outline">
          {reassigning ? "Reassigning..." : "Reassign"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
