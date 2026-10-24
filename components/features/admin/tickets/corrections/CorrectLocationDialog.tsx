"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CorrectionAvailability, LocationCorrectionResult } from "@/lib/types/admin-ticket-corrections";
import { distanceMeters } from "@/lib/utils/distance";
import { postCorrection } from "./postCorrection";

const CorrectLocationMap = dynamic(() => import("./CorrectLocationMap"), { ssr: false });

const REASON_MAX_LENGTH = 1000;

// Staff location correction (manuscript pp. 42–45; manuscript revision Phase
// 3, step 3e): moves the ticket only, never the citizen's pin. Click the map
// (or drag the new pin, or type the coordinates) to choose the point; the
// server requires it inside a Porac barangay and sets the barangay from it.
export function CorrectLocationDialog({
  open,
  onOpenChange,
  availability,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availability: CorrectionAvailability;
}) {
  const router = useRouter();
  const current = { lat: availability.lat, lng: availability.lng };
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [latText, setLatText] = useState("");
  const [lngText, setLngText] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function pick(point: { lat: number; lng: number }) {
    setPicked(point);
    setLatText(point.lat.toFixed(6));
    setLngText(point.lng.toFixed(6));
  }

  function typed(lat: string, lng: string) {
    setLatText(lat);
    setLngText(lng);
    const la = Number(lat);
    const ln = Number(lng);
    setPicked(lat.trim() && lng.trim() && Number.isFinite(la) && Number.isFinite(ln) ? { lat: la, lng: ln } : null);
  }

  function close() {
    setPicked(null);
    setLatText("");
    setLngText("");
    setReason("");
    setError("");
    setSubmitting(false);
    onOpenChange(false);
  }

  async function confirm() {
    if (!picked) return;
    setSubmitting(true);
    setError("");
    const result = await postCorrection<LocationCorrectionResult>(availability.ticketId, "location", { ...picked, reason });
    if (result.ok) {
      close();
      router.refresh();
    } else {
      setError(result.message);
      setSubmitting(false);
    }
  }

  const moved = picked ? Math.round(distanceMeters(current, picked)) : null;

  return (
    <Dialog onOpenChange={(next) => (next ? onOpenChange(true) : close())} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Correct the location of Ticket #{availability.ticketId}</DialogTitle>
          <DialogDescription>
            Now: {availability.barangayName} ({availability.lat.toFixed(5)}, {availability.lng.toFixed(5)}). Click the map or drag
            the new pin; the citizen&apos;s own pin stays on their report.
          </DialogDescription>
        </DialogHeader>

        <div className="h-64 overflow-hidden rounded-lg border border-border sm:h-72">
          {open && <CorrectLocationMap current={current} onPick={pick} picked={picked} />}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="correct-location-lat">
              Latitude
            </label>
            <Input id="correct-location-lat" inputMode="decimal" onChange={(e) => typed(e.target.value, lngText)} value={latText} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="correct-location-lng">
              Longitude
            </label>
            <Input id="correct-location-lng" inputMode="decimal" onChange={(e) => typed(latText, e.target.value)} value={lngText} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="correct-location-distance">
          {moved === null ? "No new point chosen yet." : `Moves the ticket about ${moved} m.`}
        </p>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="correct-location-reason">
            Reason (required)
          </label>
          <Textarea
            id="correct-location-reason"
            maxLength={REASON_MAX_LENGTH}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why the location is being corrected"
            rows={2}
            value={reason}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button disabled={submitting} onClick={close} variant="outline">
            Cancel
          </Button>
          <Button disabled={submitting || picked === null || reason.trim().length === 0} onClick={confirm}>
            {submitting ? "Saving…" : "Correct location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
