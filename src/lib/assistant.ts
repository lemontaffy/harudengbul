import type { LlmConfig } from "@/lib/config";
import { streamCompletion, type ChatMessage, type LlmMessage } from "@/lib/llm";
import { executeTool, type ToolDef } from "@/lib/tools";

// 읽기 전용(부수효과 없는) 도구 — 이것만 호출한 답장은 재생성해도 중복 등록 위험이 없다.
//   hadToolCall(=재생성·삭제 경고 게이트)은 '변경' 도구가 실제로 돌았을 때만 켠다.
const READONLY_TOOLS = new Set([
  "list_events",
  "list_transactions",
  "list_memos",
  "convert_currency",
  "search_past_messages",
  "web_search",
]);

/**
 * assistant 응답 스트림 — 도구 루프(tool_calls 실행→재스트림, 최대 5회) 포함.
 * 텍스트는 즉시 enqueue, 종료 시 onDone(보인 전체 텍스트, '변경' 도구 호출 여부) 호출.
 * chat / regenerate 가 공유한다. usedTools=true 면 무언가 등록·수정됐다는 뜻(재생성 차단·삭제 경고용).
 */
export function runAssistantStream(opts: {
  conn: LlmConfig;
  llmMessages: (LlmMessage | ChatMessage)[];
  tools?: ToolDef[];
  userId: number;
  personaId: number;
  signal?: AbortSignal;
  onDone: (visible: string, usedTools: boolean) => Promise<void>;
}): ReadableStream<Uint8Array> {
  const { conn, llmMessages, tools, userId, personaId, signal, onDone } = opts;
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let visible = "";
      let usedTools = false;
      try {
        for (let guard = 0; guard < 5; guard++) {
          let roundText = "";
          let toolCalls: { id: string; name: string; arguments: string }[] | null = null;
          for await (const ev of streamCompletion(
            conn,
            llmMessages,
            tools ? { tools } : undefined,
            signal,
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

          // 변경 도구가 하나라도 돌면 재생성 차단(중복 등록 방지). 읽기 전용만이면 안 막는다.
          if (toolCalls.some((c) => !READONLY_TOOLS.has(c.name))) usedTools = true;
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
        console.error("[assistant] stream error:", err);
      } finally {
        try {
          await onDone(visible, usedTools);
        } catch (e) {
          console.error("[assistant] onDone error:", e);
        }
        controller.close();
      }
    },
  });
}
