import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Initial state must match between server and client render (neither has
  // a real viewport at that point) — the real value is only knowable client
  // side, so it's deferred to the effect below. Resolving it eagerly via
  // `typeof window` here would read the client's actual viewport during the
  // hydration render while SSR always assumed desktop, causing a hydration
  // mismatch on the mobile Sidebar's completely different DOM branch
  // (components/ui/sidebar.tsx `if (isMobile) { ... }`).
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
