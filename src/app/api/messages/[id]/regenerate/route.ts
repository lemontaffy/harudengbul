import { getCurrentUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import { buildContext, buildSystemPrompt, type Role } from "@/lib/persona";
import { type LlmMessage } from "@/lib/llm";
import { toolsForRoles } from "@/lib/tools";
import { runAssistantStream } from "@/lib/assistant";
import * as messagesRepo from "@/db/repo/messages";
import * as personasRepo from "@/db/repo/personas";
import * as usageRepo from "@/db/repo/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return Response.json({ error: "assistant 메시지만 재생성할 수 있어요." }, { status: 400 });
  }
  if (msg.hadToolCall) {
    return Response.json(
      { error: "도구(일정·가계부 등)를 실행한 응답은 재생성할 수 없어요." },
      { status: 400 },
    );
  }

  const persona = await personasRepo.getOne(user.id, msg.personaId);
  if (!persona) return Response.json({ error: "캐릭터를 찾을 수 없어요." }, { status: 400 });
  const conn = await getLlmConfig(user.id);
  if (!conn.configured) {
    return Response.json({ error: "AI 연결을 먼저 설정하세요." }, { status: 400 });
  }

  // 대상 assistant 삭제 → 직전 사용자 메시지까지가 컨텍스트가 된다.
  await messagesRepo.remove(user.id, mid);

  const history = await messagesRepo.listForPrompt(user.id, msg.personaId, 20);
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content;
  const ctx = await buildContext(user.id, lastUser);
  const roles = persona.roles as Role[];
  const llmMessages: LlmMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({ name: persona.name, roles, traits: persona.traits }, ctx),
    },
    ...history.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
  ];
  const tools = toolsForRoles(roles, ctx.handoffEnabled !== false);
  const personaId = msg.personaId;
  const userId = user.id;

  const stream = runAssistantStream({
    conn,
    llmMessages,
    tools,
    userId,
    personaId,
    signal: req.signal,
    onDone: async (visible, usedTools) => {
      if (visible.trim()) {
        await messagesRepo.add(userId, personaId, "assistant", visible, usedTools);
        await usageRepo.log(userId, "chat");
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
