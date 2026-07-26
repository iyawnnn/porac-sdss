// Raw SQL tagged-template client for PostGIS geometry columns.
// Drizzle's query builder has weak PostGIS support, so geometry work
// (barangays.geom, dem_points.geom, ST_* functions) goes through here.
export { client as sql } from "./index";
