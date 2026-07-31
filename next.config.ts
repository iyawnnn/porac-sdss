import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  rewrites() {
    return {
      // beforeFiles is still required even with app/api/** gone entirely
      // (Phase 9) — it's what routes browser requests to the standalone
      // NestJS service in api/ instead of Next's own filesystem routing.
      beforeFiles: [{ source: "/api/:path*", destination: `${API_ORIGIN}/:path*` }],
    };
  },
};

export default nextConfig;
