import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as memosRepo from "@/db/repo/memos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pub(m: memosRepo.MemoRow) {
  return {
    id: m.id,
    content: m.content,
    done: m.done,
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
    doneAt: m.doneAt ? new Date(m.doneAt).toISOString() : null,
  };
}

// tab=open(기본) | done. 기한·우선순위·카운트 뱃지 없음 — 중립 수집함.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const tab = new URL(req.url).searchParams.get("tab") === "done" ? "done" : "open";
  const rows = tab === "done" ? await memosRepo.listDone(user.id) : await memosRepo.listOpen(user.id);
  const body: { memos: ReturnType<typeof pub>[]; weekDone?: number } = { memos: rows.map(pub) };
  if (tab === "done") body.weekDone = await memosRepo.weekDoneCount(user.id);
  return Response.json(body);
}

const createSchema = z.object({ content: z.string().trim().min(1).max(2000) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "내용을 입력하세요." }, { status: 400 });
  const row = await memosRepo.create(user.id, parsed.data.content);
  return Response.json({ memo: pub(row) });
}
