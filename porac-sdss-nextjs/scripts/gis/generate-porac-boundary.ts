import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import union from "@turf/union";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

type PolygonFeature = Feature<Polygon | MultiPolygon, Record<string, unknown>>;

const barangaysPath = resolve(process.cwd(), "public/assets/gis/porac_barangays.json");
const outputPath = resolve(process.cwd(), "public/assets/gis/porac_osm_boundary.json");

function countInteriorRings(geometry: Polygon | MultiPolygon) {
  if (geometry.type === "Polygon") return Math.max(0, geometry.coordinates.length - 1);
  return geometry.coordinates.reduce((sum, polygon) => sum + Math.max(0, polygon.length - 1), 0);
}

function countPolygonParts(geometry: Polygon | MultiPolygon) {
  return geometry.type === "Polygon" ? 1 : geometry.coordinates.length;
}

function main() {
  const source = JSON.parse(readFileSync(barangaysPath, "utf8")) as FeatureCollection;
  const polygonFeatures = source.features.filter((feature): feature is PolygonFeature => {
    return feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon";
  });

  if (polygonFeatures.length !== 29) {
    throw new Error(`Expected 29 Porac barangay polygons, found ${polygonFeatures.length}.`);
  }

  const dissolved = union(
    { type: "FeatureCollection", features: polygonFeatures },
    {
      properties: {
        name: "Porac",
        boundary: "dissolved_barangays",
        source: "public/assets/gis/porac_barangays.json",
        barangay_count: polygonFeatures.length,
        generated_at: new Date().toISOString(),
      },
    }
  ) as PolygonFeature | null;

  if (!dissolved) throw new Error("Turf union returned an empty municipal boundary.");

  const parts = countPolygonParts(dissolved.geometry);
  const interiorRings = countInteriorRings(dissolved.geometry);
  if (parts !== 1) {
    throw new Error(`Dissolved Porac boundary has ${parts} disconnected polygon parts; expected 1 seamless polygon.`);
  }
  if (interiorRings !== 0) {
    throw new Error(`Dissolved Porac boundary has ${interiorRings} interior ring(s), indicating possible gap slivers.`);
  }

  const output: FeatureCollection = {
    type: "FeatureCollection",
    features: [dissolved],
  };

  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote dissolved Porac municipal boundary to ${outputPath}`);
  console.log(`Verified ${polygonFeatures.length} source polygons, ${parts} dissolved part, ${interiorRings} interior rings.`);
}

main();
