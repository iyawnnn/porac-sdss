import type { useRouter } from "next/navigation";

// Re-renders Ticket Detail after a save. Use this instead of router.refresh()
// on this page (IAN-32): in a production build (Next 16.2.12), a refresh of
// the current URL here can leave the transition suspended, so the page keeps
// showing the old status and actions while the save has gone through (the
// staff member then clicks again and the ticket moves a second step).
// Navigating to the same page under a fresh URL commits reliably. `replace`
// adds no history entry; the page ignores the `v` parameter.
export function reloadTicketDetail(router: ReturnType<typeof useRouter>): void {
  const url = new URL(window.location.href);
  url.searchParams.set("v", Date.now().toString(36));
  router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
}
