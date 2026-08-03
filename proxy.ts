import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { verifyCitizenSession, CITIZEN_SESSION_COOKIE } from "@/lib/auth/citizenSession";

// Page-level redirect UX only now (Phase 9) — NestJS's AdminSessionGuard /
// CitizenSessionGuard own all API auth, so /api/** is no longer in
// config.matcher below and never reaches this function. Keeping both
// checks here would just be double verification on every API request for
// no added security.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") {
      return NextResponse.next();
    }
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;
    if (!session) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  // Citizen-side: report submission, public map, and my reports require an
  // account (PLAN.md §9 decision: no anonymous/guest reporting). /login
  // and /signup themselves are never matched here — see config.matcher.
  const token = request.cookies.get(CITIZEN_SESSION_COOKIE)?.value;
  const session = token ? await verifyCitizenSession(token) : null;
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/report", "/map", "/reports/:path*", "/account"],
};
