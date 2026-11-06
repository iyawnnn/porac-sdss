/** Presentation only: retain zero, and round to one decimal without trailing .0. */
export function metricDuration(hours: number | null): string {
  if (hours === null) return "No data yet";
  const days = hours >= 24;
  const value = Math.round((days ? hours / 24 : hours) * 10) / 10;
  return `${value} ${days ? (value === 1 ? "day" : "days") : value === 1 ? "hour" : "hours"}`;
}
