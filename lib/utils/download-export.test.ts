import assert from "node:assert/strict";
import test from "node:test";
import { fetchExport } from "./download-export";

test("export refusal uses the server message and never reads a download blob", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.credentials, "include");
    return new Response(JSON.stringify({ message: "Too many rows. Narrow your filters." }), { status: 400 });
  };
  try {
    await assert.rejects(fetchExport("/api/admin/reports/tickets.csv"), /Too many rows. Narrow your filters./);
  } finally { globalThis.fetch = original; }
});

test("export preserves the server filename and file bytes", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("server file", {
    headers: { "Content-Disposition": 'attachment; filename="tickets-2026-11-06.csv"' },
  });
  try {
    const file = await fetchExport("/api/admin/reports/tickets.csv");
    assert.equal(file.filename, "tickets-2026-11-06.csv");
    assert.equal(await file.blob.text(), "server file");
  } finally { globalThis.fetch = original; }
});
