"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import exifr from "exifr";
import imageCompression from "browser-image-compression";
import { CATEGORIES, SEVERITIES } from "@/lib/validation/report";
import { MUNICIPALITY } from "@/lib/municipality-config";

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Center of the barangays bounding box from Phase 0 seeding.
const CITY_CENTER: [number, number] = [MUNICIPALITY.centerLat, MUNICIPALITY.centerLng];

// Field styling shared across the form (DESIGN.md §4.2): 48px min height,
// 16px text (below this iOS Safari zooms the viewport on focus), md
// radius, 1px line-200 border.
const FIELD_CLASS =
  "w-full h-12 px-4 text-base rounded-md border border-line-200 bg-surface text-ink-900";
const LABEL_CLASS = "block text-xs uppercase tracking-wide font-medium text-ink-700 mb-1.5";

function FlyToPosition({ position }: { position: L.LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(position, map.getZoom());
  }, [position, map]);
  return null;
}

function LocationMarker({
  position,
  setPosition,
}: {
  position: L.LatLng;
  setPosition: (p: L.LatLng, source: "manual") => void;
}) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng, "manual");
    },
  });
  return (
    <Marker
      position={position}
      draggable
      icon={icon}
      eventHandlers={{
        dragend(e) {
          setPosition((e.target as L.Marker).getLatLng(), "manual");
        },
      }}
    />
  );
}

export default function ReportForm() {
  const [position, setPositionRaw] = useState<L.LatLng>(
    L.latLng(CITY_CENTER[0], CITY_CENTER[1])
  );
  const [locationSource, setLocationSource] = useState<"exif" | "manual" | "default">("default");
  const [file, setFile] = useState<File | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function setPosition(p: L.LatLng, source: "exif" | "manual") {
    setPositionRaw(p);
    setLocationSource(source);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setProcessingPhoto(true);

    // PLAN.md §8: read EXIF from the ORIGINAL file, before compression
    // strips it. GPS is the primary location source; manual pin drag is
    // the visible fallback (see LocationMarker above).
    try {
      const gps = await exifr.gps(selected);
      if (typeof gps?.latitude === "number" && typeof gps?.longitude === "number") {
        setPosition(L.latLng(gps.latitude, gps.longitude), "exif");
      }
    } catch {
      // No/unreadable EXIF — pin stays wherever it already was (default or
      // previously set), citizen places it manually.
    }

    try {
      const compressed = await imageCompression(selected, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        preserveExif: true,
      });
      setFile(new File([compressed], selected.name, { type: compressed.type }));
    } catch {
      setFile(selected);
    }

    setProcessingPhoto(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setStatus("error");
      setMessage("Please attach a photo.");
      return;
    }
    setStatus("submitting");

    const form = new FormData(e.currentTarget);
    form.set("lat", String(position.lat));
    form.set("lng", String(position.lng));
    form.set("image", file);

    const res = await fetch("/api/reports", { method: "POST", body: form });
    const data = await res.json();

    if (res.ok) {
      setStatus("success");
      const flagNote = data.flags?.length ? ` Flags: ${data.flags.join(", ")}.` : "";
      setMessage(
        `Report submitted. Ticket #${data.ticketId}, barangay: ${data.barangay}, elevation: ${data.elevationM}m, office: ${data.assignedOffice}.${flagNote}`
      );
      formRef.current?.reset();
      setFile(null);
      setLocationSource("default");
    } else {
      setStatus("error");
      setMessage(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
    }
  }

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-[1.75rem] leading-[2.125rem] font-semibold tracking-[-0.02em] text-ink-900 mb-4">
        Report a Hazard
      </h1>

      <div className="h-96 w-full mb-2 rounded-md overflow-hidden border border-line-200">
        <MapContainer center={CITY_CENTER} zoom={13} className="h-full w-full">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          <FlyToPosition position={position} />
          <LocationMarker position={position} setPosition={setPosition} />
        </MapContainer>
      </div>
      <p className="text-sm text-ink-500 mb-5">
        Pin:{" "}
        <span className="font-mono tabular-nums text-ink-700">
          {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
        </span>{" "}
        (click map or drag pin) —{" "}
        {locationSource === "exif"
          ? "set from photo GPS"
          : locationSource === "manual"
            ? "set manually"
            : "default city center, place your pin"}
      </p>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="title" className={LABEL_CLASS}>
            Title
          </label>
          <input id="title" name="title" required className={FIELD_CLASS} />
        </div>

        <div>
          <label htmlFor="description" className={LABEL_CLASS}>
            Description (optional)
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            className="w-full min-h-24 px-4 py-3 text-base rounded-md border border-line-200 bg-surface text-ink-900"
          />
        </div>

        <div>
          <label htmlFor="category" className={LABEL_CLASS}>
            Category
          </label>
          <select id="category" name="category" required className={FIELD_CLASS}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className={LABEL_CLASS}>Severity</span>
          {/* Segmented control, four 48px-tall targets (DESIGN.md §4.2) —
              replaces bare <input type="radio"> at ~16px, unusable with wet
              hands outdoors. Native radios drive selection and form
              submission as before; :has() styles the label around each. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SEVERITIES.map((s) => (
              <label
                key={s}
                className="flex h-12 items-center justify-center rounded-md border border-line-200 text-sm font-medium text-ink-700 cursor-pointer has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500 has-[:checked]:text-white"
              >
                <input type="radio" name="citizen_severity" value={s} required className="sr-only" />
                {s}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="photo" className={LABEL_CLASS}>
            Photo
          </label>
          <input
            id="photo"
            type="file"
            accept="image/*"
            required
            onChange={handleFileChange}
            className="w-full h-12 px-4 text-base rounded-md border border-line-200 bg-surface text-ink-700 file:h-full file:mr-4 file:border-0 file:bg-brand-50 file:px-4 file:font-medium file:text-brand-700"
          />
          {processingPhoto && <p className="text-sm text-ink-500 mt-1.5">Reading photo...</p>}
        </div>

        <button
          type="submit"
          disabled={status === "submitting" || processingPhoto}
          className="w-full h-12 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-base font-medium disabled:opacity-50"
        >
          {status === "submitting" ? "Submitting..." : "Submit Report"}
        </button>

        {/* DESIGN.md §4.2: errors at 14px, urgency-critical-ink, icon +
            text, aria-live="polite" so screen readers announce the result
            without needing focus to move. */}
        <div aria-live="polite">
          {message && (
            <p
              className={`text-sm flex items-start gap-1.5 ${
                status === "error" ? "text-urgency-critical-ink" : "text-status-resolved-ink"
              }`}
            >
              <span aria-hidden="true">{status === "error" ? "⚠" : "✓"}</span>
              <span>{message}</span>
            </p>
          )}
        </div>
      </form>
    </main>
  );
}
