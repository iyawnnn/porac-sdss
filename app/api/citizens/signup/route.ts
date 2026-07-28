import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { citizens } from "@/lib/db/schema";
import { signCitizenSession, CITIZEN_SESSION_COOKIE } from "@/lib/auth/citizenSession";

export async function POST(req: NextRequest) {
  const { email, password, firstName, lastName } = await req.json();

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof firstName !== "string" ||
    typeof lastName !== "string" ||
    password.length < 8
  ) {
    return NextResponse.json(
      { error: "Email, password (min 8 chars), first name, and last name are required." },
      { status: 400 }
    );
  }

  const [existing] = await db.select().from(citizens).where(eq(citizens.email, email));
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [citizen] = await db
    .insert(citizens)
    .values({ email, passwordHash, firstName, lastName })
    .returning();

  const token = await signCitizenSession({
    citizenId: citizen.id,
    email: citizen.email,
    citizenName: `${citizen.firstName} ${citizen.lastName}`,
  });

  const res = NextResponse.json({ ok: true }, { status: 201 });
  res.cookies.set(CITIZEN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
