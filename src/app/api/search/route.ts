import { getCurrentUser } from "@/lib/currentUser";
import * as messagesRepo from "@/db/repo/messages";
import * as diaryRepo from "@/db/repo/diary";
import * as memosRepo from "@/db/repo/memos";
import * as personasRepo from "@/db/repo/personas";
import { makeSnippet, normalizeQuery, MIN_QUERY_LEN, type SearchHit, type SearchType } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_TYPE_LIMIT = 30;

// YYYY-MM-DD → 그 날 시작/끝(서버 로컬). 잘못된 값이면 undefined.
function dayStart(s: string | null): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d.getTime()) ? undefined : d;
}
function dayEnd(s: string | null): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T23:59:59.999`);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = normalizeQuery(url.searchParams.get("q"));
  const typeRaw = url.searchParams.get("type") ?? "all";
  const type: "all" | SearchType =
    typeRaw === "chat" || typeRaw === "diary" || typeRaw === "memo" ? typeRaw : "all";
  const personaRaw = Number(url.searchParams.get("persona"));
  const personaId = Number.isInteger(personaRaw) && personaRaw > 0 ? personaRaw : undefined;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!q) return Response.json({ hits: [], query: "", tooShort: false });
  if (q.length < MIN_QUERY_LEN) {
    return Response.json({ hits: [], query: q, tooShort: true });
  }

  const fromD = dayStart(from);
  const toD = dayEnd(to);
  const wantChat = type === "all" || type === "chat";
  const wantDiary = type === "all" || type === "diary";
  const wantMemo = type === "all" || type === "memo";

  // 채팅 결과의 persona 이름 표시용 맵(소유 스코프).
  const personaName = new Map<number, string>();
  if (wantChat) {
    for (const p of await personasRepo.listByUser(user.id)) {
      personaName.set(p.id, p.name?.trim() || "이름 없는 캐릭터");
    }
  }

  const [chatRows, diaryRes, memoRows] = await Promise.all([
    wantChat
      ? messagesRepo.searchUnified(user.id, q, { personaId, from: fromD, to: toD, limit: PER_TYPE_LIMIT })
      : Promise.resolve([]),
    wantDiary
      ? diaryRepo.search(user.id, { q, from: from ?? undefined, to: to ?? undefined, limit: PER_TYPE_LIMIT })
      : Promise.resolve({ rows: [], hasMore: false }),
    wantMemo
      ? memosRepo.search(user.id, q, { from: fromD, to: toD, limit: PER_TYPE_LIMIT })
      : Promise.resolve([]),
  ]);

  const hits: (SearchHit & { sortKey: number })[] = [];

  for (const m of chatRows) {
    hits.push({
      type: "chat",
      id: m.id,
      personaId: m.personaId,
      personaName: personaName.get(m.personaId),
      date: m.createdAt ? m.createdAt.toISOString() : null,
      snippet: makeSnippet(m.content, q),
      pinned: m.pinned,
      href: `/chat/${m.personaId}?focus=${m.id}`,
      sortKey: m.createdAt ? m.createdAt.getTime() : 0,
    });
  }
  for (const e of diaryRes.rows) {
    hits.push({
      type: "diary",
      id: e.id,
      date: e.entryDate,
      snippet: makeSnippet(e.body, q),
      href: `/diary?focus=${e.entryDate}`,
      sortKey: new Date(`${e.entryDate}T12:00:00`).getTime(),
    });
  }
  for (const mo of memoRows) {
    hits.push({
      type: "memo",
      id: mo.id,
      date: mo.createdAt ? mo.createdAt.toISOString() : null,
      snippet: makeSnippet(mo.content, q),
      href: `/memos?focus=${mo.id}`,
      sortKey: mo.createdAt ? mo.createdAt.getTime() : 0,
    });
  }

  hits.sort((a, b) => b.sortKey - a.sortKey);
  return Response.json({
    query: q,
    tooShort: false,
    hits: hits.map(({ sortKey: _sk, ...h }) => h),
  });
}
