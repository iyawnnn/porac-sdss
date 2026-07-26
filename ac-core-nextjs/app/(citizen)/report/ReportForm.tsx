"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import exifr from "exifr";
import imageCompression from "browser-image-compression";
import { CATEGORIES, SEVERITIES } from "@/lib/validation/report";

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Center of the barangays bounding box from Phase 0 seeding.
const CITY_CENTER: [number, number] = [15.14, 120.57];

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
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Report a Hazard</h1>

      <div className="h-96 w-full mb-2">
        <MapContainer center={CITY_CENTER} zoom={13} className="h-full w-full">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          <FlyToPosition position={position} />
          <LocationMarker position={position} setPosition={setPosition} />
        </MapContainer>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Pin: {position.lat.toFixed(5)}, {position.lng.toFixed(5)} (click map or drag pin) —{" "}
        {locationSource === "exif"
          ? "set from photo GPS"
          : locationSource === "manual"
            ? "set manually"
            : "default city center, place your pin"}
      </p>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
        <input name="title" placeholder="Title" required className="w-full border p-2" />
        <textarea
          name="description"
          placeholder="Description (optional)"
          className="w-full border p-2"
        />

        <select name="category" required className="w-full border p-2">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="flex gap-3 flex-wrap">
          {SEVERITIES.map((s) => (
            <label key={s} className="flex items-center gap-1">
              <input type="radio" name="citizen_severity" value={s} required /> {s}
            </label>
          ))}
        </div>

        <input
          type="file"
          accept="image/*"
          required
          onChange={handleFileChange}
          className="w-full"
        />
        {processingPhoto && <p className="text-sm text-gray-500">Reading photo...</p>}

        <button
          type="submit"
          disabled={status === "submitting" || processingPhoto}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {status === "submitting" ? "Submitting..." : "Submit Report"}
        </button>

        {message && (
          <p className={status === "error" ? "text-red-600" : "text-green-700"}>{message}</p>
        )}
      </form>
    </main>
  );
}
