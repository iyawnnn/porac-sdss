"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, useMap, useMapEvents } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import exifr from "exifr";
import imageCompression from "browser-image-compression";
import { CATEGORIES, SEVERITIES } from "@/lib/utils/validation";
import { MUNICIPALITY } from "@/lib/municipality-config";
import { createDefaultMarkerIcon } from "@/lib/gis/leaflet-icons";
import { bindBarangayHoverTooltip, styleBarangayFeature, styleMunicipalBoundary } from "@/lib/gis/map-styles";

const icon = createDefaultMarkerIcon();

function LocationPinIcon() {
  return (
    <svg viewBox="0 0 512 512" className="h-5 w-5 shrink-0" aria-hidden="true">
      <defs>
        <clipPath id="location-pin-left-half">
          <rect x="0" y="0" width="256" height="512" />
        </clipPath>
        <clipPath id="location-pin-right-half">
          <rect x="256" y="0" width="256" height="512" />
        </clipPath>
      </defs>
      <path
        d="M256 512C256 512 416 306.8 416 176C416 78.8 344.8 0 256 0C167.2 0 96 78.8 96 176C96 306.8 256 512 256 512Z"
        fill="#FF0F4C"
        clipPath="url(#location-pin-left-half)"
      />
      <path
        d="M256 512C256 512 416 306.8 416 176C416 78.8 344.8 0 256 0C167.2 0 96 78.8 96 176C96 306.8 256 512 256 512Z"
        fill="#E2002E"
        clipPath="url(#location-pin-right-half)"
      />
      <circle cx="256" cy="176" r="88" fill="white" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0 text-brand-600"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="7.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

const CITY_CENTER: [number, number] = [MUNICIPALITY.centerLat, MUNICIPALITY.centerLng];
const PORAC_BOUNDS: L.LatLngBoundsExpression = [
  [MUNICIPALITY.minLat, MUNICIPALITY.minLng],
  [MUNICIPALITY.maxLat, MUNICIPALITY.maxLng],
];
const PORAC_BOUNDS_OBJ = L.latLngBounds(PORAC_BOUNDS);
const EXIF_MISMATCH_THRESHOLD_M = 100;

const FIELD_CLASS =
  "w-full h-12 px-4 text-base rounded-lg border border-line-200 bg-surface text-ink-900";
const LABEL_CLASS = "block text-xs uppercase tracking-wide font-medium text-ink-700 mb-2";
const BADGE_BASE = "rounded-lg border px-3 py-2 text-sm font-medium";
const CARD_CLASS = "bg-white rounded-2xl shadow-sm border border-line-200 p-6 sm:p-8";

type ExifStatus = "idle" | "processing" | "verified" | "missing" | "outside";
type BarangayFeature = Feature<Polygon | MultiPolygon, { name?: string; NAME_4?: string; ADM4_EN?: string }>;

function MapController({ target, position }: { target: L.LatLng | null; position: L.LatLng | null }) {
  const map = useMap();

  useEffect(() => {
    map.setMaxBounds(PORAC_BOUNDS);
  }, [map]);

  useEffect(() => {
    const destination = target ?? position;
    if (destination) map.flyTo(destination, Math.max(map.getZoom(), 15));
  }, [target, position, map]);

  return null;
}

function LocationMarker({
  enabled,
  position,
  setPosition,
}: {
  enabled: boolean;
  position: L.LatLng | null;
  setPosition: (p: L.LatLng, source: "manual") => void;
}) {
  useMapEvents({
    click(e) {
      if (enabled) setPosition(e.latlng, "manual");
    },
  });

  if (!position) return null;

  return (
    <Marker
      position={position}
      draggable={enabled}
      icon={icon}
      eventHandlers={{
        dragend(e) {
          if (enabled) setPosition((e.target as L.Marker).getLatLng(), "manual");
        },
      }}
    />
  );
}

function isInsidePoracBounds(point: L.LatLng) {
  return PORAC_BOUNDS_OBJ.contains(point);
}

function pointInRing(lat: number, lng: number, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lat: number, lng: number, polygon: Position[][]) {
  if (!pointInRing(lat, lng, polygon[0])) return false;
  return polygon.slice(1).every((hole) => !pointInRing(lat, lng, hole));
}

function featureContainsPoint(feature: BarangayFeature, lat: number, lng: number) {
  const geometry: Geometry = feature.geometry;
  if (geometry.type === "Polygon") return pointInPolygon(lat, lng, geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(lat, lng, polygon));
  }
  return false;
}

function getBarangayName(feature: BarangayFeature) {
  return feature.properties?.name ?? feature.properties?.NAME_4 ?? feature.properties?.ADM4_EN ?? "Unknown";
}

function findBarangay(features: BarangayFeature[], point: L.LatLng | null) {
  if (!point) return null;
  const match = features.find((feature) => featureContainsPoint(feature, point.lat, point.lng));
  return match ? getBarangayName(match) : null;
}

function getRingCentroid(ring: Position[]) {
  let twiceArea = 0;
  let weightedLng = 0;
  let weightedLat = 0;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const lng1 = ring[j][0];
    const lat1 = ring[j][1];
    const lng2 = ring[i][0];
    const lat2 = ring[i][1];
    const cross = lng1 * lat2 - lng2 * lat1;
    twiceArea += cross;
    weightedLng += (lng1 + lng2) * cross;
    weightedLat += (lat1 + lat2) * cross;
  }

  if (Math.abs(twiceArea) < 1e-12) return null;
  return { lat: weightedLat / (3 * twiceArea), lng: weightedLng / (3 * twiceArea), area: twiceArea / 2 };
}

function getFeatureCentroid(feature: BarangayFeature) {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  let totalArea = 0;
  let weightedLat = 0;
  let weightedLng = 0;

  for (const polygon of polygons) {
    const centroid = getRingCentroid(polygon[0]);
    if (!centroid) continue;
    const area = Math.abs(centroid.area);
    totalArea += area;
    weightedLat += centroid.lat * area;
    weightedLng += centroid.lng * area;
  }

  if (totalArea > 0) return L.latLng(weightedLat / totalArea, weightedLng / totalArea);

  const coordinates = polygons.flat(2);
  const average = coordinates.reduce(
    (acc, point) => ({ lat: acc.lat + point[1], lng: acc.lng + point[0] }),
    { lat: 0, lng: 0 }
  );
  return L.latLng(average.lat / coordinates.length, average.lng / coordinates.length);
}

function ExifBadge({ status }: { status: ExifStatus }) {
  if (status === "processing") {
    return <div className={`${BADGE_BASE} border-line-200 bg-surface text-ink-700`}>Reading photo metadata...</div>;
  }
  if (status === "verified") {
    return (
      <div className={`${BADGE_BASE} border-status-resolved bg-status-resolved-bg text-status-resolved-ink`}>
        GPS Metadata Verified (EXIF Found)
      </div>
    );
  }
  if (status === "missing") {
    return (
      <div className={`${BADGE_BASE} border-amber-300 bg-amber-50 text-amber-900`}>
        No GPS Metadata Found in Photo. Please click the map to select the hazard location manually.
      </div>
    );
  }
  if (status === "outside") {
    return (
      <div className={`${BADGE_BASE} border-red-300 bg-red-50 text-red-900`}>
        Photo GPS location is outside Porac municipality bounds.
      </div>
    );
  }
  return <p className="text-sm text-ink-500">Upload a photo to check GPS metadata.</p>;
}

export default function ReportForm() {
  const [position, setPositionRaw] = useState<L.LatLng | null>(null);
  const [exifPosition, setExifPosition] = useState<L.LatLng | null>(null);
  const [searchTarget, setSearchTarget] = useState<L.LatLng | null>(null);
  const [locationSource, setLocationSource] = useState<"exif" | "manual" | "default">("default");
  const [file, setFile] = useState<File | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [exifStatus, setExifStatus] = useState<ExifStatus>("idle");
  const [barangayFeatures, setBarangayFeatures] = useState<BarangayFeature[]>([]);
  const [municipalBoundary, setMunicipalBoundary] = useState<FeatureCollection | null>(null);
  const detectedBarangay = useMemo(() => findBarangay(barangayFeatures, position), [barangayFeatures, position]);
  const [locationError, setLocationError] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const mapEnabled = Boolean(file) && !processingPhoto;

  useEffect(() => {
    fetch("/assets/gis/porac_barangays.json")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("barangay geojson unavailable"))))
      .then((data: FeatureCollection) => {
        setBarangayFeatures(data.features.filter((feature): feature is BarangayFeature => {
          return feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon";
        }));
      })
      .catch(() => setBarangayFeatures([]));
    fetch("/assets/gis/porac_osm_boundary.json")
      .then((res) => (res.ok ? res.json() : null))
      .then(setMunicipalBoundary);
  }, []);


  const barangayGeoJson = useMemo<FeatureCollection | null>(() => {
    if (barangayFeatures.length === 0) return null;
    return { type: "FeatureCollection", features: barangayFeatures };
  }, [barangayFeatures]);

  const searchOptions = useMemo(() => {
    return barangayFeatures
      .map((feature) => {
        const center = getFeatureCentroid(feature);
        return { label: getBarangayName(feature), lat: center.lat, lng: center.lng };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [barangayFeatures]);

  const exifMismatchM = useMemo(() => {
    if (!position || !exifPosition) return 0;
    return position.distanceTo(exifPosition);
  }, [position, exifPosition]);

  const pinText = useMemo(() => {
    if (!position) return "No pin selected";
    return `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
  }, [position]);

  function setPosition(p: L.LatLng, source: "exif" | "manual") {
    if (!mapEnabled && source === "manual") return;
    if (!isInsidePoracBounds(p)) {
      setLocationError("Selected location is outside Porac municipality bounds.");
      if (source === "exif") setExifStatus("outside");
      return;
    }
    setLocationError("");
    setPositionRaw(p);
    setLocationSource(source);
    setSearchTarget(null);
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = searchOptions[Number(e.target.value)];
    if (!selected || !mapEnabled) return;
    const target = L.latLng(selected.lat, selected.lng);
    if (!isInsidePoracBounds(target)) return;
    setSearchTarget(target);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setProcessingPhoto(true);
    setExifStatus("processing");
    setExifPosition(null);
    setSearchTarget(null);
    setLocationError("");
    setMessage("");
    setFile(selected);

    try {
      const gps = await exifr.gps(selected);
      if (typeof gps?.latitude === "number" && typeof gps?.longitude === "number") {
        const gpsPosition = L.latLng(gps.latitude, gps.longitude);
        if (isInsidePoracBounds(gpsPosition)) {
          setExifPosition(gpsPosition);
          setPositionRaw(gpsPosition);
          setLocationSource("exif");
          setExifStatus("verified");
        } else {
          setExifStatus("outside");
          setLocationError("Photo GPS location is outside Porac municipality bounds.");
        }
      } else {
        setExifStatus("missing");
      }
    } catch {
      setExifStatus("missing");
    }

    try {
      const compressed = await imageCompression(selected, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        preserveExif: true,
      });
      setFile(new File([compressed], selected.name, { type: compressed.type || selected.type }));
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
    if (!position) {
      setStatus("error");
      setMessage("Please select a hazard location inside Porac.");
      return;
    }
    if (!isInsidePoracBounds(position)) {
      setStatus("error");
      setMessage("Selected location is outside Porac municipality bounds.");
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
      setPositionRaw(null);
      setExifPosition(null);
      setSearchTarget(null);
      setLocationSource("default");
      setExifStatus("idle");
    } else {
      setStatus("error");
      setMessage(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
    }
  }

  return (
    <main className="max-w-350 mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <header className="mb-8 text-left">
        <h1 className="text-[1.75rem] sm:text-3xl leading-tight font-bold text-ink-900">
          Report a Hazard
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Help keep Porac safe. Report hazards in your area.
        </p>
      </header>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8 items-stretch"
      >
        {/* Left Card - Hazard Location */}
        <section className={`${CARD_CLASS} lg:col-span-3 space-y-4`}>
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
              <LocationPinIcon /> Hazard Location
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Search for a barangay and pin the exact location.
            </p>
          </div>

          <div>
            <label htmlFor="location-search" className={LABEL_CLASS}>
              Barangay Search
            </label>
            <select
              id="location-search"
              className={FIELD_CLASS}
              onChange={handleSearchChange}
              disabled={!mapEnabled}
              defaultValue=""
            >
              <option value="">Search Porac barangays</option>
              {searchOptions.map((option, index) => (
                <option key={option.label} value={index}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={`relative h-125 sm:h-140 w-full my-1 rounded-xl overflow-hidden border border-line-200 ${!mapEnabled ? "bg-line-100" : ""}`}>
            <div className={!mapEnabled ? "h-full w-full opacity-45 grayscale pointer-events-none" : "h-full w-full"}>
              <MapContainer
                center={CITY_CENTER}
                zoom={MUNICIPALITY.defaultZoom}
                minZoom={11}
                maxBounds={PORAC_BOUNDS}
                maxBoundsViscosity={1}
                className="h-full w-full"
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />
                {municipalBoundary && <GeoJSON data={municipalBoundary} style={styleMunicipalBoundary} />}
                {barangayGeoJson && (
                  <GeoJSON
                    data={barangayGeoJson}
                    style={styleBarangayFeature}
                    onEachFeature={bindBarangayHoverTooltip}
                  />
                )}
                <MapController target={searchTarget} position={position} />
                <LocationMarker enabled={mapEnabled} position={position} setPosition={setPosition} />
              </MapContainer>
            </div>
            {!mapEnabled && (
              <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/70 px-6 text-center text-sm font-medium text-ink-700">
                Please upload a photo first to enable map location pinning.
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-line-200 bg-line-50 px-4 py-3 text-sm text-ink-500">
            <p className="flex flex-wrap items-center gap-1.5">
              <InfoIcon />
              <span className="font-mono tabular-nums text-ink-700">{pinText}</span>{" "}
              {locationSource === "exif"
                ? "- set from photo GPS, drag pin to fine-tune"
                : locationSource === "manual"
                  ? "- set manually"
                  : "- upload a geotagged photo or click inside Porac"}
            </p>
            {detectedBarangay && (
              <p className="inline-flex rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-brand-700">
                Detected Barangay: {detectedBarangay}
              </p>
            )}
            {exifPosition && exifMismatchM > EXIF_MISMATCH_THRESHOLD_M && (
              <p className={`${BADGE_BASE} border-amber-300 bg-amber-50 text-amber-900`}>
                Pin placed &gt;100m away from photo GPS. This submission will be flagged for review.
              </p>
            )}
            {!detectedBarangay && position && (
              <p className="text-amber-800">Pin is inside the Porac bounding box but outside loaded barangay polygons.</p>
            )}
            {locationError && <p className="text-urgency-critical-ink">{locationError}</p>}
          </div>
        </section>

        {/* Right Card - Hazard Details */}
        <section className={`${CARD_CLASS} lg:col-span-2 flex flex-col gap-5`}>
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
              <span aria-hidden="true">📝</span> Hazard Details
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Provide details about the hazard you want to report.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="photo" className={LABEL_CLASS}>
                Step 1 - Photo
              </label>
              <input
                id="photo"
                type="file"
                accept="image/*"
                required
                onChange={handleFileChange}
                className="w-full h-12 px-4 text-base rounded-lg border border-line-200 bg-surface text-ink-700 file:h-full file:mr-4 file:border-0 file:bg-brand-50 file:px-4 file:font-medium file:text-brand-700 file:cursor-pointer file:transition-colors file:duration-150 hover:file:bg-brand-100"
              />
            </div>
            <ExifBadge status={exifStatus} />
          </div>

          <div>
            <label htmlFor="title" className={LABEL_CLASS}>
              Title
            </label>
            <input id="title" name="title" required className={FIELD_CLASS} />
          </div>

          <div className="flex flex-1 flex-col">
            <label htmlFor="description" className={LABEL_CLASS}>
              Description (optional)
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              className="w-full min-h-30 flex-1 resize-none px-4 py-3 text-base rounded-lg border border-line-200 bg-surface text-ink-900"
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
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {SEVERITIES.map((s) => (
                <label
                  key={s}
                  className="flex h-12 items-center justify-center rounded-lg border border-line-200 text-sm font-medium text-ink-700 cursor-pointer transition-colors hover:border-brand-300 hover:bg-brand-50 has-checked:border-brand-500 has-checked:bg-brand-500 has-checked:text-white has-checked:hover:bg-brand-600"
                >
                  <input type="radio" name="citizen_severity" value={s} required className="sr-only" />
                  {s}
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={status === "submitting" || processingPhoto}
            className="w-full h-14 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-base font-bold disabled:opacity-50"
          >
            {status === "submitting" ? "Submitting..." : "Submit Report"}
          </button>

          <div aria-live="polite">
            {message && (
              <p
                className={`text-sm flex items-start gap-1.5 ${
                  status === "error" ? "text-urgency-critical-ink" : "text-status-resolved-ink"
                }`}
              >
                <span>{message}</span>
              </p>
            )}
          </div>
        </section>
      </form>
    </main>
  );
}
