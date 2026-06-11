import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import { buildContext, buildSystemPrompt, type Role } from "@/lib/persona";
import { streamChatCompletion, type ChatMessage } from "@/lib/llm";
import * as messagesRepo from "@/db/repo/messages";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import * as usageRepo from "@/db/repo/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().min(1).max(8000),
  personaId: z.number().int().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "잘못된 입력" }, { status: 400 });
  }

  const conn = await getLlmConfig(user.id);
  if (!conn.configured) {
    return Response.json(
      { error: "AI 연결을 먼저 설정하세요 (설정 → AI 연결)." },
      { status: 400 },
    );
  }

  // 대상 캐릭터 결정: body.personaId → settings.active → 첫 활성 캐릭터.
  // 본인 소유 + 활성 캐릭터만 허용(DELTA §5 격리).
  let persona = parsed.data.personaId
    ? await personasRepo.getOne(user.id, parsed.data.personaId)
    : null;
  if (!persona || !persona.isActive) {
    const s = await settingsRepo.getByUser(user.id);
    persona = s?.activePersonaId
      ? (await personasRepo.getOne(user.id, s.activePersonaId)) ?? null
      : null;
    if (!persona || !persona.isActive) {
      const [first] = await personasRepo.listActiveByUser(user.id);
      persona = first ?? null;
    }
  }
  if (!persona) {
    return Response.json(
      { error: "대화할 캐릭터가 없어요. 설정에서 캐릭터를 추가하세요." },
      { status: 400 },
    );
  }

  // 사용자 메시지 먼저 저장
  await messagesRepo.add(user.id, persona.id, "user", parsed.data.message);

  // 시스템 프롬프트(3층) + 최근 히스토리(방금 저장한 user 포함).
  // 캐릭터(name/role/traits)는 반드시 "본인" 것만 주입(DELTA §5).
  const [ctx, history] = await Promise.all([
    buildContext(user.id),
    messagesRepo.listForPrompt(user.id, persona.id, 20),
  ]);
  const llmMessages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(
        { name: persona.name, role: persona.role as Role, traits: persona.traits },
        ctx,
      ),
    },
    ...history.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
  ];

  const personaId = persona.id;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        for await (const delta of streamChatCompletion(
          conn,
          llmMessages,
          req.signal,
        )) {
          full += delta;
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        if (!full) {
          controller.enqueue(
            encoder.encode("⚠️ 응답 생성에 실패했어요. 연결 설정을 확인해 주세요."),
          );
        }
        console.error("[chat] stream error:", err);
      } finally {
        if (full.trim()) {
          await messagesRepo.add(user.id, personaId, "assistant", full);
          await usageRepo.log(user.id, "chat");
        }
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
