import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { verifyCitizenSession, CITIZEN_SESSION_COOKIE } from "@/lib/auth/citizenSession";

const ADMIN_PUBLIC_PATHS = ["/admin/login", "/api/admin/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (ADMIN_PUBLIC_PATHS.includes(pathname)) {
      return NextResponse.next();
    }
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;
    if (!session) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  // Citizen-side: report submission and "my reports" now require an
  // account (PLAN.md §9 decision: no anonymous/guest reporting). /login
  // and /signup themselves are never matched here — see config.matcher.
  const token = request.cookies.get(CITIZEN_SESSION_COOKIE)?.value;
  const session = token ? await verifyCitizenSession(token) : null;
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/dashboard/:path*", "/report", "/api/reports"],
};
