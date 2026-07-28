import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { citizens } from "@/lib/db/schema";
import { signCitizenSession, CITIZEN_SESSION_COOKIE } from "@/lib/auth/citizenSession";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const [citizen] = await db.select().from(citizens).where(eq(citizens.email, email));

  if (!citizen || !(await bcrypt.compare(password, citizen.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await signCitizenSession({
    citizenId: citizen.id,
    email: citizen.email,
    citizenName: `${citizen.firstName} ${citizen.lastName}`,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(CITIZEN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
