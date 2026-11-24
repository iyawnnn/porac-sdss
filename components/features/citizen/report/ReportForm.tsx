"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, useMap, useMapEvents } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import exifr from "exifr";
import imageCompression from "browser-image-compression";
import { CATEGORIES, SEVERITIES, SEVERITY_DESCRIPTIONS } from "@/lib/utils/validation";
import { LOCATION_MISMATCH_THRESHOLD_M, isLocationMismatch } from "@/lib/utils/location-mismatch";
import {
  NO_SEVERITY,
  chooseAnotherLevel,
  chooseSeverity,
  confirmCritical,
  needsCriticalConfirmation,
} from "@/lib/utils/severity-selection";
import { CircleAlert, CircleCheck, ImagePlus, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmergencyNotice } from "@/components/features/citizen/emergency/EmergencyNotice";
import { officeLabel } from "@/lib/utils/citizen-report-copy";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MUNICIPALITY } from "@/lib/municipality-config";
import { createDefaultMarkerIcon } from "@/lib/gis/leaflet-icons";
import { getBarangayFeatureName } from "@/lib/gis/map-styles";
import { apiErrorMessage } from "@/lib/utils/api-error-message";

const icon = createDefaultMarkerIcon();

const CITY_CENTER: [number, number] = [MUNICIPALITY.centerLat, MUNICIPALITY.centerLng];
const PORAC_BOUNDS: L.LatLngBoundsExpression = [
  [MUNICIPALITY.minLat, MUNICIPALITY.minLng],
  [MUNICIPALITY.maxLat, MUNICIPALITY.maxLng],
];
const PORAC_BOUNDS_OBJ = L.latLngBounds(PORAC_BOUNDS);

const FIELD_CLASS =
  "w-full h-11 px-3.5 text-base rounded-lg border border-input bg-background text-foreground outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60";
const LABEL_CLASS = "mb-1.5 block text-sm font-medium text-foreground";
const BADGE_BASE = "rounded-lg border px-3 py-2 text-sm font-medium";
const CARD_CLASS = "rounded-xl border border-border bg-card";

function StepHeading({ step, title, description }: { step: number; title: string; description: string }) {
  return (
    <div className="flex gap-3 border-b border-border px-5 py-4">
      <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background tabular-nums">
        {step}
      </span>
      <div>
        <h2 className="text-base leading-6 font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// Object URL for the chosen photo, revoked when it changes or the form unmounts.
function usePreviewUrl(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

// Same muted, theme-aware boundaries as the public map (.citizen-map in globals.css).
const MUNICIPALITY_STYLE: L.PathOptions = { className: "pm-municipality", weight: 2, fill: false, interactive: false };
const BARANGAY_STYLE: L.PathOptions = { className: "pm-barangay", weight: 1, color: "#000", fillColor: "#000", fillOpacity: 0 };
function bindBarangayTooltip(feature: Feature, layer: L.Layer) {
  (layer as L.Path).bindTooltip(`Brgy. ${getBarangayFeatureName(feature)}`, { sticky: true, direction: "top", className: "barangay-boundary-tooltip" });
}

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
      <div className={`${BADGE_BASE} border-status-resolved-dot/30 bg-status-resolved-tint text-status-resolved-ink`}>
        GPS Metadata Verified (EXIF Found)
      </div>
    );
  }
  if (status === "missing") {
    return (
      <div className={`${BADGE_BASE} border-warning-edge bg-warning-tint text-warning-ink`}>
        No GPS Metadata Found in Photo. Please click the map to select the hazard location manually.
      </div>
    );
  }
  if (status === "outside") {
    return (
      <div className={`${BADGE_BASE} border-red-300 bg-danger-tint text-danger-ink`}>
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
  // Critical needs the citizen's confirmation (lib/utils/severity-selection.ts).
  const [severityChoice, setSeverityChoice] = useState(NO_SEVERITY);
  const formRef = useRef<HTMLFormElement>(null);
  const mapEnabled = Boolean(file) && !processingPhoto;
  const previewUrl = usePreviewUrl(file);

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

  // When the Critical dialog closes, focus the level that is now selected
  // (the restored one after "Choose another level"), not the Critical option
  // that opened it.
  function focusSelectedSeverity(event: Event) {
    const options = formRef.current?.querySelectorAll<HTMLInputElement>('input[name="citizen_severity"]');
    const selected = Array.from(options ?? []).find((option) => option.checked) ?? options?.[0];
    if (!selected) return;
    event.preventDefault();
    selected.focus();
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
    if (needsCriticalConfirmation(severityChoice)) {
      setSeverityChoice((s) => ({ ...s, confirming: s.confirming ?? { previous: null } }));
      return;
    }

    setStatus("submitting");

    const form = new FormData(e.currentTarget);
    form.set("lat", String(position.lat));
    form.set("lng", String(position.lng));
    form.set("image", file);

    let succeeded = false;
    try {
      const res = await fetch("/api/reports", { method: "POST", body: form });
      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        // Flags are internal review signals (EXIF/GPS/staleness/duplicate checks) —
        // never shown as raw codes to the citizen; the report goes through review
        // either way, so a short neutral note is enough here.
        const flagNote: string = data.needsReview
          ? " This report has been flagged for additional review by city staff."
          : "";
        // The tracking reference and the office's full name (manuscript
        // revision Phase 6, step 6b) — not the internal ticket number or the
        // raw office code.
        setMessage(
          `Report submitted. Tracking reference: ${data.trackingReference}. Barangay: ${data.barangay}. Handled by the ${officeLabel(data.assignedOffice)}.${flagNote}`,
        );
        formRef.current?.reset();
        setFile(null);
        setPositionRaw(null);
        setExifPosition(null);
        setSearchTarget(null);
        setLocationSource("default");
        setExifStatus("idle");
        setSeverityChoice(NO_SEVERITY);
        succeeded = true;
      } else {
        const fallback =
          res.status === 429
            ? "Too many reports were submitted from this network. Please try again later."
            : "We couldn't submit your report. Please try again.";
        setMessage(apiErrorMessage(data, fallback));
      }
    } catch {
      setMessage("We couldn't submit your report. Please try again.");
    } finally {
      if (!succeeded) setStatus("error");
    }
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header>
        <h1 className="text-2xl/8 font-semibold tracking-tight text-foreground">Report a Hazard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a photo, pin where it is, and describe it. Municipal personnel review every report.
        </p>
      </header>

      <EmergencyNotice />

      {/* Steps follow the real order: the photo unlocks the map, then the details. On desktop the
          photo and map stack on the left while the details stay in view on the right. */}
      <form ref={formRef} onSubmit={handleSubmit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className={CARD_CLASS}>
            <StepHeading step={1} title="Photo" description="A clear photo of the hazard. Its GPS data, if any, places the pin for you." />
            <div className="flex flex-col gap-3 p-5">
              <label
                htmlFor="photo"
                className="group flex cursor-pointer items-center gap-4 rounded-lg border border-dashed border-input p-3 transition-colors duration-150 hover:border-foreground/40 hover:bg-muted/50 has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/20"
              >
                <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local object URL preview, not an optimizable asset
                    <img src={previewUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <ImagePlus aria-hidden="true" className="size-6" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{file ? file.name : "Choose a photo"}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {processingPhoto ? "Preparing photo…" : file ? "Choose again to replace it." : "JPG or PNG from your camera or gallery."}
                  </span>
                </span>
                {processingPhoto && <Spinner aria-label="Preparing photo" className="me-1 text-muted-foreground" />}
                <input id="photo" type="file" accept="image/*" required onChange={handleFileChange} className="sr-only" />
              </label>
              <ExifBadge status={exifStatus} />
            </div>
          </section>

          <section className={CARD_CLASS}>
            <StepHeading step={2} title="Location" description="Pin the exact spot inside Porac, or pick a barangay to jump there." />
            <div className="flex flex-col gap-4 p-5">
              <div>
                <label htmlFor="location-search" className={LABEL_CLASS}>
                  Barangay Search
                </label>
                <select id="location-search" className={FIELD_CLASS} onChange={handleSearchChange} disabled={!mapEnabled} defaultValue="">
                  <option value="">Search Porac barangays</option>
                  {searchOptions.map((option, index) => (
                    <option key={option.label} value={index}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* isolate keeps Leaflet's panes and controls (z-index 400-1000) and
                  the photo-first overlay inside the map box, below the Critical
                  severity dialog (z-50). */}
              <div className={`citizen-map relative isolate h-96 w-full overflow-hidden rounded-lg border border-border sm:h-[28rem] ${!mapEnabled ? "bg-muted" : ""}`}>
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
                      className="map-tile-muted"
                    />
                    {municipalBoundary && <GeoJSON data={municipalBoundary} style={() => MUNICIPALITY_STYLE} />}
                    {barangayGeoJson && (
                      <GeoJSON data={barangayGeoJson} style={() => BARANGAY_STYLE} onEachFeature={bindBarangayTooltip} />
                    )}
                    <MapController target={searchTarget} position={position} />
                    <LocationMarker enabled={mapEnabled} position={position} setPosition={setPosition} />
                  </MapContainer>
                </div>
                {!mapEnabled && (
                  <div className="absolute inset-0 z-[500] flex items-center justify-center bg-card/70 px-6 text-center text-sm font-medium text-foreground">
                    Please upload a photo first to enable map location pinning.
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 text-sm">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                  <MapPin aria-hidden="true" className="size-4 shrink-0" />
                  <span className="font-mono text-xs text-foreground tabular-nums">{pinText}</span>
                  <span>
                    {locationSource === "exif"
                      ? "Set from photo GPS. Drag the pin to fine-tune."
                      : locationSource === "manual"
                        ? "Set manually."
                        : "Upload a geotagged photo or click inside Porac."}
                  </span>
                </p>
                {detectedBarangay && (
                  <p className="inline-flex w-fit items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 font-medium text-foreground">
                    Detected Barangay: {detectedBarangay}
                  </p>
                )}
                {exifPosition && isLocationMismatch(exifMismatchM) && (
                  <p className={`${BADGE_BASE} border-warning-edge bg-warning-tint text-warning-ink`}>
                    Pin placed &gt;{LOCATION_MISMATCH_THRESHOLD_M}m away from photo GPS. This submission will be flagged for review.
                  </p>
                )}
                {!detectedBarangay && position && (
                  <p className="text-warning-ink">The selected location is outside Porac&apos;s barangay boundaries. Move the pin to a location inside Porac.</p>
                )}
                {locationError && <p className="text-danger-ink">{locationError}</p>}
              </div>
            </div>
          </section>
        </div>

        <section className={`${CARD_CLASS} lg:sticky lg:top-6`}>
          <StepHeading step={3} title="Details" description="What is it, and how serious is it?" />
          <div className="flex flex-col gap-5 p-5">
            <div>
              <label htmlFor="title" className={LABEL_CLASS}>
                Title
              </label>
              <input id="title" name="title" required maxLength={200} placeholder="e.g. Deep pothole near the market" className={FIELD_CLASS} />
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
              <label htmlFor="description" className={LABEL_CLASS}>
                Description <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                maxLength={2000}
                placeholder="Anything that helps personnel find or understand it"
                className={`${FIELD_CLASS} h-auto min-h-24 resize-y py-2.5`}
              />
            </div>

            <fieldset className="min-w-0">
              <legend className={LABEL_CLASS}>Severity</legend>
              <div className="flex flex-col gap-2">
                {SEVERITIES.map((s) => (
                  <label
                    key={s}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-2.5 transition-colors duration-150 hover:bg-muted/50 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/20"
                  >
                    <input
                      type="radio"
                      name="citizen_severity"
                      value={s}
                      required
                      checked={severityChoice.severity === s}
                      onChange={() => setSeverityChoice((current) => chooseSeverity(current, s))}
                      aria-labelledby={`severity-${s.toLowerCase()}-name`}
                      aria-describedby={`severity-${s.toLowerCase()}-description`}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                    />
                    <span className="min-w-0">
                      <span id={`severity-${s.toLowerCase()}-name`} className="block text-sm font-medium text-foreground">
                        {s}
                      </span>
                      <span id={`severity-${s.toLowerCase()}-description`} className="mt-0.5 block text-sm text-muted-foreground">
                        {SEVERITY_DESCRIPTIONS[s]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Button
              type="submit"
              disabled={status === "submitting" || processingPhoto}
              aria-busy={status === "submitting"}
              className="h-12 w-full gap-2 text-base hover:bg-primary-hover active:bg-primary-pressed active:not-aria-[haspopup]:translate-y-0"
            >
              {status === "submitting" ? "Submitting" : "Submit Report"}
              {status === "submitting" && <Spinner aria-label="Submitting report" />}
            </Button>

            <div role={status === "error" ? "alert" : undefined} aria-live="polite">
              {message && (
                <div
                  className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${
                    status === "error"
                      ? "border-danger-edge bg-danger-tint text-danger-ink"
                      : "border-status-resolved-dot/30 bg-status-resolved-tint text-status-resolved-ink"
                  }`}
                >
                  {status === "error" ? (
                    <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p>{message}</p>
                    {status === "success" && (
                      <a href="/reports" className="mt-1.5 inline-block font-medium underline underline-offset-4">
                        View my reports
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </form>

      {/* Closing with Escape or the overlay counts as "Choose another level". */}
      <Dialog
        open={severityChoice.confirming !== null}
        onOpenChange={(open) => {
          if (!open) setSeverityChoice(chooseAnotherLevel);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false} onCloseAutoFocus={focusSelectedSeverity}>
          <DialogHeader>
            <DialogTitle>Confirm Critical severity</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Critical means immediate serious danger, or the area or service is effectively blocked or unusable.
                  Is that what you&apos;re seeing?
                </p>
                <p className="font-medium text-danger-ink">
                  If you or someone else is in immediate danger, contact the appropriate emergency service right away.
                  Submitting a report does not dispatch help.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeverityChoice(chooseAnotherLevel)}>
              Choose another level
            </Button>
            <Button onClick={() => setSeverityChoice(confirmCritical)}>Yes, it&apos;s Critical</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
