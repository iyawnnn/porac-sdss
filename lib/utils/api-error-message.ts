// The API's own refusal text: Nest puts it in `message` (a string, or a list
// for validation errors); `error` is only the status name ("Conflict").
export function apiErrorMessage(data: unknown, fallback: string): string {
  const body = data as { message?: unknown; formErrors?: unknown; fieldErrors?: unknown } | null;
  const message = body?.message;
  if (Array.isArray(message)) return message.join(" ");
  if (typeof message === "string" && message) return message;
  if (Array.isArray(body?.formErrors) && body.formErrors.length) {
    const formErrors = body.formErrors.filter((error): error is string => typeof error === "string");
    if (formErrors.length) return formErrors.join(" ");
  }
  if (body?.fieldErrors && typeof body.fieldErrors === "object") {
    for (const [field, errors] of Object.entries(body.fieldErrors)) {
      if (Array.isArray(errors)) {
        const first = errors.find((error): error is string => typeof error === "string" && Boolean(error));
        if (first) return `${field}: ${first}`;
      }
    }
  }
  return fallback;
}
