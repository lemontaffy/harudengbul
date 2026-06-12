import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import { streamChatCompletion, type ChatMessage } from "@/lib/llm";
import { buildEmergencyPrompt } from "@/lib/pocket";
import * as pocketRepo from "@/db/repo/pocket";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ message: z.string().min(1).max(4000) });

// 응급 모드 상담사 응답(스트리밍). 저장하지 않는다(일시적 위로).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });

  const conn = await getLlmConfig(user.id);
  if (!conn.configured) {
    return Response.json(
      { error: "AI 연결을 먼저 설정하세요 (설정 → AI 연결)." },
      { status: 400 },
    );
  }

  const [s, cards] = await Promise.all([
    settingsRepo.getByUser(user.id),
    pocketRepo.listByUser(user.id),
  ]);

  // 상담사 캐릭터(목소리): 저녁 담당 → 첫 활성 상담가 → 첫 캐릭터.
  let persona = s?.eveningPersonaId
    ? await personasRepo.getOne(user.id, s.eveningPersonaId)
    : undefined;
  if (!persona || !persona.roles.includes("counselor") || !persona.isActive) {
    const actives = await personasRepo.listActiveByUser(user.id);
    persona = actives.find((p) => p.roles.includes("counselor")) ?? actives[0];
  }

  const system = buildEmergencyPrompt(
    persona?.name ?? null,
    persona?.traits ?? null,
    cards.map((c) => c.body),
  );
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: parsed.data.message },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of streamChatCompletion(conn, messages, req.signal)) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        controller.enqueue(encoder.encode("⚠️ 응답을 가져오지 못했어요. 잠시 뒤 다시 시도해 주세요."));
        console.error("[pocket] stream error:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
