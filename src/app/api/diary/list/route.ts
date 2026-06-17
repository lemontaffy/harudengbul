import { getCurrentUser } from "@/lib/currentUser";
import * as diaryRepo from "@/db/repo/diary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ymd = /^\d{4}-\d{2}-\d{2}$/;

// 일기 검색/필터 + 페이지네이션(최신순). q(본문)·mood·from·to·offset. 한 페이지 10건.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const q = sp.get("q") ?? undefined;
  const mood = sp.get("mood") ?? undefined;
  const from = sp.get("from");
  const to = sp.get("to");
  const offset = Number(sp.get("offset") ?? 0) || 0;
  const limit = 10;

  const { rows, hasMore } = await diaryRepo.search(user.id, {
    q,
    mood: mood || undefined,
    from: from && ymd.test(from) ? from : undefined,
    to: to && ymd.test(to) ? to : undefined,
    limit,
    offset,
  });

  const itemsMap = await diaryRepo.getItemsForEntries(rows.map((r) => r.id));
  const entries = rows.map((e) => ({
    id: e.id,
    entryDate: e.entryDate,
    mood: e.mood,
    body: e.body,
    photoPath: e.photoPath ?? null,
    aiReply: e.aiReply,
    aiPersona: e.aiPersona,
    items: (itemsMap.get(e.id) ?? []).map((it) => ({
      id: it.id,
      label: it.label,
      amount: it.amount,
      weight: it.weight,
    })),
  }));

  return Response.json({ entries, hasMore, nextOffset: offset + entries.length });
}
