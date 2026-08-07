export default function CitizenMapLoading() {
  return <div aria-busy="true" aria-label="Loading map" className="h-[calc(100vh-var(--app-header-height,3.5rem))] w-full animate-pulse bg-line-100" />;
}
