import type { NextConfig } from "next";

// 127.0.0.1, not 'localhost' — avoids Node's IPv6-first DNS resolution
// racing against the NestJS API's IPv4 bind (see api/src/main.ts).
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  redirects() {
    return [
      {
        // Focal intake notifications created before manuscript revision
        // Phase 3, step 3a link to /admin/intake/{id}, the API path, which
        // has no page. Send them to the intake detail page, where proxy.ts
        // and the page's own Focal-only API read still decide access.
        // Numeric ids only; temporary (307) like the app's other redirects.
        source: "/admin/intake/:id(\\d+)",
        destination: "/admin/focal/intake/:id",
        permanent: false,
      },
    ];
  },
  rewrites() {
    return {
      // beforeFiles is still required even with app/api/** gone entirely
      // (Phase 9) — it's what routes browser requests to the standalone
      // NestJS service in api/ instead of Next's own filesystem routing.
      beforeFiles: [{ source: "/api/:path*", destination: `${API_ORIGIN}/:path*` }],
    };
  },
  headers() {
    return [
      {
        // Static values only — deliberately excludes CSP (separate,
        // Report-Only-first change; see docs/security-hardening-plan.md R7).
        // No helmet on the API: it returns JSON to a same-origin proxy, so
        // the browser-facing headers belong here, where the HTML is.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // geolocation/camera/microphone: verified against the app source
          // that none of the three browser permission APIs are ever called
          // (the report form's pin comes from EXIF GPS or a manual map
          // click, never navigator.geolocation) — safe to deny outright.
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
