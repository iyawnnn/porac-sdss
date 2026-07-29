import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/raw";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { uploadImage } from "@/lib/cloudinary";

const NEXT_STATUS: Record<string, string> = {
  Reported: "Under Review",
  "Under Review": "In Progress",
  "In Progress": "Resolved",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticketId = Number(id);

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [ticket] = await sql<{ status: string }[]>`SELECT status FROM tickets WHERE id = ${ticketId}`;
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const nextStatus = NEXT_STATUS[ticket.status];
  if (!nextStatus) {
    return NextResponse.json({ error: `No transition available from ${ticket.status}` }, { status: 400 });
  }

  // Resolving is the only transition that can carry a proof photo + notes,
  // submitted as multipart form data from the resolve modal; every other
  // transition still POSTs with no body.
  let resolutionImageUrl: string | null = null;
  let resolutionNotes: string | null = null;
  if (nextStatus === "Resolved" && (req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const formData = await req.formData();
    const notes = formData.get("notes");
    resolutionNotes = typeof notes === "string" && notes.trim() ? notes.trim() : null;

    const image = formData.get("image");
    if (image instanceof File && image.size > 0) {
      const buffer = Buffer.from(await image.arrayBuffer());
      resolutionImageUrl = await uploadImage(buffer);
    }
  }

  await sql.begin(async (tx) => {
    await tx`
      UPDATE tickets SET
        status = ${nextStatus},
        resolution_image_url = COALESCE(${resolutionImageUrl}, resolution_image_url),
        resolution_notes = COALESCE(${resolutionNotes}, resolution_notes),
        updated_at = now()
      WHERE id = ${ticketId}
    `;
    await tx`
      INSERT INTO status_history (ticket_id, status, admin_id, admin_name, changed_at)
      VALUES (${ticketId}, ${nextStatus}, ${session.adminId}, ${session.adminName}, now())
    `;
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
