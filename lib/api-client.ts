import { headers } from "next/headers";
import type { AdminSession } from "./auth/session";
import type { CitizenSession } from "./auth/citizenSession";

// Server Component -> NestJS. Cookies aren't forwarded automatically on a
// server-to-server fetch (unlike the browser's same-origin /api/* rewrite),
// so every call here forwards the incoming request's Cookie header
// manually — that's what lets AdminSessionGuard/CitizenSessionGuard see the
// session on SSR requests.
// 127.0.0.1, not 'localhost' — avoids Node's IPv6-first DNS resolution
// racing against the NestJS API's IPv4 bind (see api/src/main.ts).
const BASE = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:3001";

async function cookieHeader(): Promise<HeadersInit> {
  return { cookie: (await headers()).get("cookie") ?? "" };
}

const NETWORK_FAILURE_RETRIES = 2;
const NETWORK_FAILURE_RETRY_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// fetch() rejects (ECONNREFUSED, DNS failure, etc.) rather than resolving
// with a bad status, so that failure mode needs its own catch — a bare
// `await fetch(...)` on a down API surfaces to the page as an opaque
// Next.js "fetch failed" digest with no indication of which call or host
// was responsible. cookieHeader() is resolved outside the try: headers()
// throws Next's internal DYNAMIC_SERVER_USAGE control-flow signal during
// static generation, and that error's `digest` must reach Next unwrapped
// or the route fails the build instead of just bailing to dynamic render.
//
// A short bounded retry is scoped to exactly this connection-level failure
// (never to a resolved response, however its status) — the two local dev
// processes (Next + NestJS) occasionally drop a request with ECONNREFUSED
// under bursty concurrent load with no server actually down, and every
// Server Component on every admin/citizen page goes through this one
// function, so this is the single place to absorb that blip. A real 401 or
// 429 still resolves normally and is never retried here — this only
// changes behavior for genuine socket-level failures.
async function fetchApi(path: string): Promise<Response> {
  const requestHeaders = await cookieHeader();
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(`${BASE}${path}`, {
        headers: requestHeaders,
        cache: "no-store",
      });
    } catch (cause) {
      if (attempt >= NETWORK_FAILURE_RETRIES) {
        console.error(`[api-client] request to ${BASE}${path} failed:`, cause);
        throw new Error(`${path} -> network error reaching ${BASE}`, { cause });
      }
      await sleep(NETWORK_FAILURE_RETRY_DELAY_MS);
    }
  }
}

// cache: "no-store" is required on every call — urgency scores, weather,
// and ticket/report state are recomputed live per request, not static.
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetchApi(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

// For calls where certain statuses are an expected outcome, not an error —
// e.g. 401 when proxy.ts's redirect-before-render defense in depth is the
// only thing standing between an unauthenticated request and this call, or
// 404 for a page that wants to call notFound() itself. Defaults to just 401.
export async function apiGetOptional<T>(path: string, treatAsNull: number[] = [401]): Promise<T | null> {
  const res = await fetchApi(path);
  if (treatAsNull.includes(res.status)) return null;
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

interface MeResponse {
  type: "admin" | "citizen";
  session: AdminSession | CitizenSession;
}

// Replacements for lib/auth/getSession.ts / getCitizenSession.ts, which
// read the JWT cookie and verified it locally against lib/db-adjacent
// code. NestJS's AuthController now owns verification; this asks it via
// GET /auth/me instead of duplicating jose/JWT_SECRET logic here.
export async function getAdminSessionFromApi(): Promise<AdminSession | null> {
  const me = await apiGetOptional<MeResponse>("/auth/me");
  return me?.type === "admin" ? (me.session as AdminSession) : null;
}

export async function getCitizenSessionFromApi(): Promise<CitizenSession | null> {
  const me = await apiGetOptional<MeResponse>("/auth/me");
  return me?.type === "citizen" ? (me.session as CitizenSession) : null;
}
