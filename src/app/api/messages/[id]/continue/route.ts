import { getCurrentUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import { buildContext, buildSystemPrompt, type Role } from "@/lib/persona";
import { streamChatCompletion, type ChatMessage } from "@/lib/llm";
import * as messagesRepo from "@/db/repo/messages";
import * as personasRepo from "@/db/repo/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTINUE_INSTRUCTION =
  "직전 응답이 중간에 끊겼어. 인사나 같은 말 반복 없이, 끊긴 지점에서 바로 이어서 자연스럽게 완성해줘.";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const mid = Number((await params).id);
  if (!Number.isInteger(mid)) return Response.json({ error: "bad id" }, { status: 400 });

  const msg = await messagesRepo.getOne(user.id, mid);
  if (!msg) return Response.json({ error: "없는 메시지" }, { status: 404 });
  if (msg.role !== "assistant") {
    return Response.json({ error: "assistant 메시지만 이어쓸 수 있어요." }, { status: 400 });
  }

  const persona = await personasRepo.getOne(user.id, msg.personaId);
  if (!persona) return Response.json({ error: "캐릭터를 찾을 수 없어요." }, { status: 400 });
  const conn = await getLlmConfig(user.id);
  if (!conn.configured) {
    return Response.json({ error: "AI 연결을 먼저 설정하세요." }, { status: 400 });
  }

  // 대상 메시지까지의 히스토리 + "이어서 완성하라" 지시.
  const history = await messagesRepo.listForPromptThrough(
    user.id,
    msg.personaId,
    msg.id,
    20,
  );
  const ctx = await buildContext(user.id);
  const role = persona.role as Role;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({ name: persona.name, role, traits: persona.traits }, ctx),
    },
    ...history.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
    { role: "user", content: CONTINUE_INSTRUCTION },
  ];

  const userId = user.id;
  const original = msg.content;
  const encoder = new TextEncoder();
  let cont = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of streamChatCompletion(conn, messages, req.signal)) {
          cont += delta;
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        if (!cont) controller.enqueue(encoder.encode("⚠️ 이어쓰기에 실패했어요."));
        console.error("[continue] stream error:", err);
      } finally {
        // 기존 메시지에 이어붙여 update(새 메시지 만들지 않음).
        if (cont.trim()) {
          await messagesRepo.updateContent(userId, mid, original + cont);
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
