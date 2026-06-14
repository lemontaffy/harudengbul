import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as suggRepo from "@/db/repo/achievementSuggestions";
import * as achievementsRepo from "@/db/repo/achievements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ title: z.string().trim().min(1).max(200) });

// 업적 후보 승인 → 업적판 등록(추출 텍스트만). 사용자가 수정한 title 우선.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });

  const s = await suggRepo.getOne(user.id, id);
  if (!s) return Response.json({ error: "없는 항목" }, { status: 404 });
  if (s.status !== "pending") return Response.json({ error: "이미 처리됨" }, { status: 409 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  const title = parsed.success ? parsed.data.title : s.suggestedText;

  const ach = await achievementsRepo.create(user.id, title, s.sourcePersonaId);
  const ok = await suggRepo.accept(user.id, id, ach.id);
  if (!ok) return Response.json({ error: "이미 처리됨" }, { status: 409 });
  return Response.json({ ok: true, achievementId: ach.id });
}
