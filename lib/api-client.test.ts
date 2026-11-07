import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, beforeEach, mock, test } from "node:test";
import { ApiError, apiGet, apiGetOptional } from "./api-client";

const nextHeaders = createRequire(path.resolve("package.json"))("next/headers") as typeof import("next/headers");

beforeEach(() => {
  mock.method(nextHeaders, "headers", async () => new Headers({ cookie: "test-session=fixture" }));
});
afterEach(() => mock.restoreAll());

test("API refusals preserve status and path without retrying HTTP errors", async () => {
  for (const status of [401, 403, 404, 500]) {
    const fetch = mock.method(globalThis, "fetch", async () => new Response(null, { status }));
    await assert.rejects(apiGet("/admin/tickets"), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, status);
      assert.equal(error.message, `/admin/tickets -> ${status}`);
      return true;
    });
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
});

test("optional reads still return null for 401 by default", async () => {
  mock.method(globalThis, "fetch", async () => new Response(null, { status: 401 }));
  assert.equal(await apiGetOptional("/admin/tickets"), null);
});

test("real 404 stays an error unless explicitly treated as missing", async () => {
  mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
  await assert.rejects(apiGetOptional("/admin/tickets/1"), (error: unknown) => error instanceof ApiError && error.status === 404);
  assert.equal(await apiGetOptional("/admin/tickets/1", [401, 404]), null);
});

test("403 stays typed while intentional optional refusals still return null", async () => {
  mock.method(globalThis, "fetch", async () => new Response(null, { status: 403 }));
  await assert.rejects(apiGetOptional("/admin/tickets"), (error: unknown) => error instanceof ApiError && error.status === 403);
  assert.equal(await apiGetOptional("/admin/admins", [401, 403]), null);
});

test("successful reads retain JSON, cookie forwarding and no-store", async () => {
  mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get("cookie"), "test-session=fixture");
    assert.equal(init?.cache, "no-store");
    return Response.json({ tickets: [] });
  });
  assert.deepEqual(await apiGet("/admin/tickets"), { tickets: [] });
  assert.deepEqual(await apiGetOptional("/admin/tickets"), { tickets: [] });
});

test("connection failures retain bounded retries and are not HTTP refusals", async () => {
  const failure = new TypeError("fetch failed");
  const fetch = mock.method(globalThis, "fetch", async () => { throw failure; });
  mock.method(console, "error", () => {});
  await assert.rejects(apiGet("/admin/tickets"), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(!(error instanceof ApiError));
    assert.match(error.message, /network error reaching/);
    assert.equal(error.cause, failure);
    return true;
  });
  assert.equal(fetch.mock.callCount(), 3);
});
