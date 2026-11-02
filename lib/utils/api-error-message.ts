// The API's own refusal text: Nest puts it in `message` (a string, or a list
// for validation errors); `error` is only the status name ("Conflict").
export function apiErrorMessage(data: unknown, fallback: string): string {
  const message = (data as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) return message.join(" ");
  return typeof message === "string" && message ? message : fallback;
}
