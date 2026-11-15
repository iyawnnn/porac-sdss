import type { Request } from 'express';

const isLoopback = (addr: string) =>
  addr === '::1' || addr.startsWith('127.') || addr.startsWith('::ffff:127.');

// Express `trust proxy` function. Next's /api rewrite (http-proxy without
// xfwd) appends nothing to X-Forwarded-For — it passes the client's own
// header through verbatim — so trusting the Next hop alone would hand the
// rate limiters a client-chosen IP. Hop 0 (the socket peer, i.e. Next on
// loopback) is trusted only when `hops` edge proxies in front of Next append
// the real client address; with hops = 0 every forwarded header is ignored
// and req.ip is the socket address. A direct caller from off-host is never
// trusted at hop 0, so it can't forge either.
// ponytail: loopback check assumes Next and the API share a host; widen it
// to Next's address if they ever run on separate machines.
export const trustProxyHops =
  (hops: number) =>
  (addr: string, i: number): boolean =>
    i < hops && (i > 0 || isLoopback(addr));

export const clientIp = (req: Request): string => req.ip ?? 'unknown';
