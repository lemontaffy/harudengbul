import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { encryptSecret } from "@/lib/crypto";
import * as connectionsRepo from "@/db/repo/connections";
import * as settingsRepo from "@/db/repo/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  baseUrl: z.string().url().optional().or(z.literal("")),
  apiKey: z.string().optional(),
  clearKey: z.boolean().optional(),
  model: z.string().optional(),
  embeddingModel: z.string().optional(),
  supportsVision: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "bad id" }, { status: 400 });

  const existing = await connectionsRepo.getOne(user.id, id);
  if (!existing) return Response.json({ error: "없는 연결" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const d = parsed.data;

  const patch: Parameters<typeof connectionsRepo.update>[2] = {};
  if (typeof d.name === "string") patch.name = d.name.trim();
  if (typeof d.baseUrl === "string") patch.baseUrl = d.baseUrl.trim() || null;
  if (typeof d.model === "string") patch.model = d.model.trim() || null;
  if (typeof d.embeddingModel === "string")
    patch.embeddingModel = d.embeddingModel.trim() || null;
  if (typeof d.supportsVision === "boolean") patch.supportsVision = d.supportsVision;
  if (d.clearKey) patch.apiKey = null;
  else if (typeof d.apiKey === "string" && d.apiKey.trim() !== "")
    patch.apiKey = encryptSecret(d.apiKey.trim());

  if (Object.keys(patch).length > 0) await connectionsRepo.update(user.id, id, patch);
  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "bad id" }, { status: 400 });

  const existing = await connectionsRepo.getOne(user.id, id);
  if (!existing) return Response.json({ error: "없는 연결" }, { status: 404 });

  await connectionsRepo.remove(user.id, id); // FK on delete set null → active 자동 해제
  // 메인이 사라졌으면 남은 연결 중 하나를 메인으로.
  const s = await settingsRepo.getByUser(user.id);
  if (s?.activeConnectionId == null) {
    const rest = await connectionsRepo.listByUser(user.id);
    if (rest.length > 0) {
      await settingsRepo.updateByUser(user.id, { activeConnectionId: rest[0].id });
    }
  }
  return Response.json({ ok: true });
}
