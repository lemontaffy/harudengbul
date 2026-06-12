import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import { buildContext, buildSystemPrompt, type Role } from "@/lib/persona";
import { type ChatMessage, type LlmMessage } from "@/lib/llm";
import { toLlmHistory } from "@/lib/chatHistory";
import { captionMessage } from "@/lib/caption";
import { toolsForRoles } from "@/lib/tools";
import { runAssistantStream } from "@/lib/assistant";
import * as messagesRepo from "@/db/repo/messages";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import * as usageRepo from "@/db/repo/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().max(8000).optional(),
  personaId: z.number().int().optional(),
  attachmentPath: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "잘못된 입력" }, { status: 400 });
  }
  const text = parsed.data.message?.trim() ?? "";
  // 본인 업로드 경로만 허용(/api/uploads/{userId}/...). 타인 경로 주입 차단.
  const attach =
    parsed.data.attachmentPath?.startsWith(`/api/uploads/${user.id}/`)
      ? parsed.data.attachmentPath
      : null;
  if (!text && !attach) {
    return Response.json({ error: "메시지나 사진이 필요해요." }, { status: 400 });
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

  // 사용자 메시지 먼저 저장(첨부 포함). 캡션은 전송을 막지 않게 비동기로.
  const userMsg = await messagesRepo.add(
    user.id,
    persona.id,
    "user",
    text,
    false,
    attach,
  );
  if (attach) void captionMessage(user.id, userMsg.id); // fire-and-forget(① aux ② 첫 비전 ③ 보류)

  // 시스템 프롬프트(3층) + 최근 히스토리(방금 저장한 user 포함).
  // 캐릭터(name/role/traits)는 반드시 "본인" 것만 주입(DELTA §5).
  const [ctx, history] = await Promise.all([
    buildContext(user.id, text), // 최근 메시지로 의미 기억 회수
    messagesRepo.listForPrompt(user.id, persona.id, 20),
  ]);
  const roles = persona.roles as Role[];
  const llmHistory = await toLlmHistory(user.id, history, conn.supportsVision);
  const llmMessages: (LlmMessage | ChatMessage)[] = [
    {
      role: "system",
      content: buildSystemPrompt(
        { name: persona.name, roles, traits: persona.traits },
        ctx,
      ),
    },
    ...llmHistory,
  ];
  // 역할 합집합 도구: 비서 포함=등록 도구, 비서 외=핸드오프(설정 켜졌을 때만, SPEC §3·6).
  const tools = toolsForRoles(roles, ctx.handoffEnabled !== false);

  const personaId = persona.id;
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
