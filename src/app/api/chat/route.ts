import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import {
  buildContext,
  buildSystemPrompt,
  isPersona,
  type PersonaId,
} from "@/lib/persona";
import { streamChatCompletion, type ChatMessage } from "@/lib/llm";
import * as messagesRepo from "@/db/repo/messages";
import * as settingsRepo from "@/db/repo/settings";
import * as usageRepo from "@/db/repo/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().min(1).max(8000),
  persona: z.enum(["theo", "nora"]).optional(),
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

  let persona: PersonaId = "nora";
  if (parsed.data.persona && isPersona(parsed.data.persona)) {
    persona = parsed.data.persona;
  } else {
    const s = await settingsRepo.getByUser(user.id);
    if (isPersona(s?.activePersona)) persona = s!.activePersona as PersonaId;
  }

  // 사용자 메시지 먼저 저장
  await messagesRepo.add(user.id, persona, "user", parsed.data.message);

  // 시스템 프롬프트 + 최근 히스토리(방금 저장한 user 포함)
  const ctx = await buildContext(user.id);
  const history = await messagesRepo.listForPrompt(user.id, persona, 20);
  const llmMessages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(persona, ctx) },
    ...history.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
  ];

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
          await messagesRepo.add(user.id, persona, "assistant", full);
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
