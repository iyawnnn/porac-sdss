"use client";

import { useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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

function LocationMarker({
  position,
  setPosition,
}: {
  position: L.LatLng;
  setPosition: (p: L.LatLng) => void;
}) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });
  return (
    <Marker
      position={position}
      draggable
      icon={icon}
      eventHandlers={{
        dragend(e) {
          setPosition((e.target as L.Marker).getLatLng());
        },
      }}
    />
  );
}

export default function ReportForm() {
  const [position, setPosition] = useState<L.LatLng>(
    L.latLng(CITY_CENTER[0], CITY_CENTER[1])
  );
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

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
      setMessage(
        `Report submitted. Ticket #${data.ticketId}, barangay: ${data.barangay}, elevation: ${data.elevationM}m, office: ${data.assignedOffice}`
      );
      formRef.current?.reset();
      setFile(null);
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
          <LocationMarker position={position} setPosition={setPosition} />
        </MapContainer>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Pin: {position.lat.toFixed(5)}, {position.lng.toFixed(5)} (click map or drag pin)
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
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full"
        />

        <button
          type="submit"
          disabled={status === "submitting"}
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
