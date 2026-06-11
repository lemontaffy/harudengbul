import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as settingsRepo from "@/db/repo/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const bodySchema = z.object({
  activePersona: z.enum(["theo", "nora"]).optional(),
  proactiveEnabled: z.boolean().optional(),
  morningTime: z.string().regex(timeRe).optional(),
  eveningTime: z.string().regex(timeRe).optional(),
  timezone: z.string().min(1).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const s = await settingsRepo.getByUser(user.id);
  return Response.json({
    activePersona: s?.activePersona ?? "nora",
    proactiveEnabled: s?.proactiveEnabled ?? false,
    morningTime: s?.morningTime ?? "08:00",
    eveningTime: s?.eveningTime ?? "22:00",
    timezone: s?.timezone ?? "Asia/Seoul",
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "잘못된 입력" }, { status: 400 });
  }

  if (Object.keys(parsed.data).length > 0) {
    await settingsRepo.updateByUser(user.id, parsed.data);
  }
  return Response.json({ ok: true });
}
