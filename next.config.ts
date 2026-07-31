import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  rewrites() {
    return {
      // beforeFiles is required, not afterFiles/a bare array — it must win
      // over the app/api/** handlers still present during the phased
      // NestJS cutover (see PLAN blueprint). Only migrated paths are
      // listed here; everything else keeps hitting its local Next
      // handler until its own phase lands. Swap this in for a
      // `/api/:path*` wildcard and delete app/api/** at Phase 8.
      beforeFiles: [
        { source: "/api/admin/login", destination: `${API_ORIGIN}/admin/login` },
        { source: "/api/admin/logout", destination: `${API_ORIGIN}/admin/logout` },
        { source: "/api/citizens/login", destination: `${API_ORIGIN}/citizens/login` },
        { source: "/api/citizens/signup", destination: `${API_ORIGIN}/citizens/signup` },
        { source: "/api/citizens/logout", destination: `${API_ORIGIN}/citizens/logout` },
        { source: "/api/auth/me", destination: `${API_ORIGIN}/auth/me` },
        { source: "/api/admin/tickets/geo", destination: `${API_ORIGIN}/admin/tickets/geo` },
        { source: "/api/admin/tickets", destination: `${API_ORIGIN}/admin/tickets` },
        { source: "/api/admin/tickets/:id", destination: `${API_ORIGIN}/admin/tickets/:id` },
        {
          source: "/api/admin/tickets/:id/priority-context",
          destination: `${API_ORIGIN}/admin/tickets/:id/priority-context`,
        },
        { source: "/api/admin/moderation", destination: `${API_ORIGIN}/admin/moderation` },
        { source: "/api/admin/moderation/stats", destination: `${API_ORIGIN}/admin/moderation/stats` },
        { source: "/api/admin/dashboard", destination: `${API_ORIGIN}/admin/dashboard` },
        { source: "/api/admin/barangays/geo", destination: `${API_ORIGIN}/admin/barangays/geo` },
        { source: "/api/admin/tickets/:id/status", destination: `${API_ORIGIN}/admin/tickets/:id/status` },
        { source: "/api/admin/tickets/:id/reassign", destination: `${API_ORIGIN}/admin/tickets/:id/reassign` },
        { source: "/api/admin/reports/:id/moderate", destination: `${API_ORIGIN}/admin/reports/:id/moderate` },
        { source: "/api/reports", destination: `${API_ORIGIN}/reports` },
        { source: "/api/reports/mine", destination: `${API_ORIGIN}/reports/mine` },
        { source: "/api/reports/mine/:id", destination: `${API_ORIGIN}/reports/mine/:id` },
        { source: "/api/public-map", destination: `${API_ORIGIN}/public-map` },
        { source: "/api/cron/recompute-urgency", destination: `${API_ORIGIN}/cron/recompute-urgency` },
        { source: "/api/cron/recompute-weather", destination: `${API_ORIGIN}/cron/recompute-weather` },
      ],
    };
  },
};

export default nextConfig;
