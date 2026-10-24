// Calls one of the staff grouping actions (api/src/admin/
// ticket-grouping.controller.ts) and returns its result, or the server's
// own message on failure so the dialog can show exactly why.
export async function postGrouping<T>(
  action: "merge" | "remove-report" | "regroup-report",
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/admin/ticket-grouping/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as (T & { message?: unknown }) | null;
    if (res.ok && data) return { ok: true, data };
    const message = Array.isArray(data?.message) ? data.message.join(" ") : data?.message;
    return { ok: false, message: typeof message === "string" ? message : "The change couldn't be saved. Try again." };
  } catch {
    return { ok: false, message: "The change couldn't be saved. Check the connection and try again." };
  }
}
