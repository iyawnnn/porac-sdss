import { apiErrorMessage } from "./api-error-message";

export async function fetchExport(href: string) {
  const response = await fetch(href, { credentials: "include" });
  if (!response.ok) {
    const body = await response.text();
    let data: unknown;
    try { data = JSON.parse(body); } catch { data = { message: body }; }
    throw new Error(apiErrorMessage(data, "Could not download export. Try again."));
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/i.exec(disposition)?.[1] ?? "export.csv";
  return { blob: await response.blob(), filename };
}
