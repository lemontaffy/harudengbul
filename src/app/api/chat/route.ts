import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import { buildContext, buildSystemPrompt, type Role } from "@/lib/persona";
import { streamCompletion, type LlmMessage } from "@/lib/llm";
import { toolsForRole, executeTool } from "@/lib/tools";
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
    buildContext(user.id, parsed.data.message), // 최근 메시지로 의미 기억 회수
    messagesRepo.listForPrompt(user.id, persona.id, 20),
  ]);
  const role = persona.role as Role;
  const llmMessages: LlmMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(
        { name: persona.name, role, traits: persona.traits },
        ctx,
      ),
    },
    ...history.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
  ];
  // 역할별 도구: 비서=등록 도구, 상담가=핸드오프(설정 켜졌을 때만, SPEC §3·6).
  const tools = toolsForRole(role, ctx.handoffEnabled !== false);

  const personaId = persona.id;
  const userId = user.id;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let visible = ""; // 사용자에게 보인(=저장할) 전체 텍스트
      try {
        // 도구 루프: tool_calls 가 나오면 실행 → 결과 추가 → 다시 스트림. 최대 5회.
        for (let guard = 0; guard < 5; guard++) {
          let roundText = "";
          let toolCalls: { id: string; name: string; arguments: string }[] | null = null;
          for await (const ev of streamCompletion(
            conn,
            llmMessages,
            tools ? { tools } : undefined,
            req.signal,
          )) {
            if (ev.type === "text") {
              roundText += ev.value;
              visible += ev.value;
              controller.enqueue(encoder.encode(ev.value));
            } else {
              toolCalls = ev.calls;
            }
          }
          if (!toolCalls || toolCalls.length === 0) break;

          // id 정규화(스트리밍에서 빈 id 대비) — assistant/tool 메시지 매칭에 사용
          const normalized = toolCalls.map((c, i) => ({
            ...c,
            id: c.id || `call_${guard}_${i}`,
          }));
          llmMessages.push({
            role: "assistant",
            content: roundText || null,
            tool_calls: normalized.map((c) => ({
              id: c.id,
              type: "function",
              function: { name: c.name, arguments: c.arguments },
            })),
          });
          for (const c of normalized) {
            const result = await executeTool(userId, c.name, c.arguments, {
              personaId,
            });
            llmMessages.push({ role: "tool", tool_call_id: c.id, content: result });
          }
        }
      } catch (err) {
        if (!visible) {
          controller.enqueue(
            encoder.encode("⚠️ 응답 생성에 실패했어요. 연결 설정을 확인해 주세요."),
          );
        }
        console.error("[chat] stream error:", err);
      } finally {
        if (visible.trim()) {
          await messagesRepo.add(userId, personaId, "assistant", visible);
          await usageRepo.log(userId, "chat");
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
