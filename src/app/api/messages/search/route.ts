import { getCurrentUser } from "@/lib/currentUser";
import * as messagesRepo from "@/db/repo/messages";
import * as personasRepo from "@/db/repo/personas";
import { makeSnippet, normalizeQuery, MIN_QUERY_LEN } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 대화방 내 검색 — 현재 대화 상대(personaId)의 메시지만. userId+personaId 스코프.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const raw = url.searchParams.get("personaId");
  const personaId = Number(raw);
  if (!raw || !Number.isInteger(personaId)) {
    return Response.json({ error: "personaId 필요" }, { status: 400 });
  }
  // 본인 소유 캐릭터만(타인 스레드 검색 차단).
  const persona = await personasRepo.getOne(user.id, personaId);
  if (!persona) return Response.json({ error: "없는 캐릭터" }, { status: 404 });

  const q = normalizeQuery(url.searchParams.get("q"));
  if (!q) return Response.json({ hits: [], query: "", tooShort: false });
  if (q.length < MIN_QUERY_LEN) {
    return Response.json({ hits: [], query: q, tooShort: true });
  }

  const rows = await messagesRepo.searchInRoom(user.id, personaId, q, 50);
  return Response.json({
    query: q,
    tooShort: false,
    hits: rows.map((m) => ({
      id: m.id,
      role: m.role,
      pinned: m.pinned,
      date: m.createdAt ? m.createdAt.toISOString() : null,
      snippet: makeSnippet(m.content, q),
    })),
  });
}
