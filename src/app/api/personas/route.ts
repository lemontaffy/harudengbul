import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { validateRoles } from "@/lib/persona";
import * as personasRepo from "@/db/repo/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  roles: z.array(z.string()).min(1).max(3),
  traits: z.string().max(2000).optional(),
});

function publicRow(p: personasRepo.PersonaRow) {
  return {
    id: p.id,
    name: p.name,
    roles: p.roles,
    avatarPath: p.avatarPath,
    traits: p.traits,
    isActive: p.isActive,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rows = await personasRepo.listActiveByUser(user.id);
  return Response.json({ personas: rows.map(publicRow) });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "잘못된 입력" }, { status: 400 });
  }
  const v = validateRoles(parsed.data.roles);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });

  const row = await personasRepo.create(user.id, {
    name: parsed.data.name,
    roles: v.roles,
    traits: parsed.data.traits?.trim() || null,
  });
  return Response.json({ persona: publicRow(row) });
}
