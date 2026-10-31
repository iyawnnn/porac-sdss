// Calls one of the manual routing actions — POST <actionPath>/reassign or
// /refer, where actionPath is /api/admin/tickets/:id (MEO / MDRRMO) or
// /api/admin/intake/:reportId (Focal) — and returns its result, or the
// server's own message on failure so the dialog can show exactly why
// (manuscript revision Phase 5, step 5a).
export async function postRouting(
  actionPath: string,
  action: "reassign" | "refer",
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${actionPath}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as { message?: unknown } | null;
    const message = Array.isArray(data?.message) ? data.message.join(" ") : data?.message;
    return {
      ok: false,
      message: typeof message === "string" ? message : `The ${action === "reassign" ? "reassignment" : "referral"} couldn't be saved. Try again.`,
    };
  } catch {
    return { ok: false, message: "The routing action couldn't be saved. Check the connection and try again." };
  }
}

// Same bound as the API (api/src/admin/ticket-routing.rules.ts).
export const ROUTING_REASON_MAX_LENGTH = 1000;
