import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as pushRepo from "@/db/repo/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PushSubscription.toJSON() 형태
const subSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = subSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "잘못된 구독 정보" }, { status: 400 });
  }
  await pushRepo.subscribe(user.id, parsed.data.endpoint, parsed.data.keys);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string" || !endpoint) {
    return Response.json({ error: "endpoint 필요" }, { status: 400 });
  }
  await pushRepo.removeForUser(user.id, endpoint);
  return Response.json({ ok: true });
}
