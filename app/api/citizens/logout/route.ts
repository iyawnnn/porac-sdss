import { NextResponse } from "next/server";
import { CITIZEN_SESSION_COOKIE } from "@/lib/auth/citizenSession";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CITIZEN_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
