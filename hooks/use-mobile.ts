import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(MEDIA_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  // useSyncExternalStore supplies the desktop server snapshot during hydration,
  // then updates from the real viewport without mutating state inside an effect.
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
