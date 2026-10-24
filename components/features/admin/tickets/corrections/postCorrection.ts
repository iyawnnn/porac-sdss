// Calls one of the staff correction actions (api/src/admin/
// ticket-corrections.controller.ts) and returns its result, or the
// server's own message on failure so the dialog can show exactly why.
export async function postCorrection<T>(
  ticketId: number,
  field: "category" | "location",
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/admin/ticket-corrections/${ticketId}/${field}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as (T & { message?: unknown }) | null;
    if (res.ok && data) return { ok: true, data };
    const message = Array.isArray(data?.message) ? data.message.join(" ") : data?.message;
    return { ok: false, message: typeof message === "string" ? message : "The correction couldn't be saved. Try again." };
  } catch {
    return { ok: false, message: "The correction couldn't be saved. Check the connection and try again." };
  }
}
