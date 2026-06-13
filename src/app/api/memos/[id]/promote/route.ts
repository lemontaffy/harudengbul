import { getCurrentUser } from "@/lib/currentUser";
import * as memosRepo from "@/db/repo/memos";
import * as handoffsRepo from "@/db/repo/handoffs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 승격 — 메모를 핸드오프 제안함으로 전달(기존 인프라 재사용). 승격돼도 메모는 남는다.
// 핸드오프 승인(일정 등록) 시 source_memo_id 로 이 메모가 자동 체크된다.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const memo = await memosRepo.getOne(user.id, id);
  if (!memo) return Response.json({ error: "없는 메모" }, { status: 404 });

  // 사용자가 직접 보낸 것이므로 source_persona_id 는 null(특정 캐릭터가 제안한 게 아님).
  const created = await handoffsRepo.createPending(user.id, null, memo.content, memo.id);
  return Response.json({ ok: true, created }); // created=false면 이미 같은 내용 대기 중
}
