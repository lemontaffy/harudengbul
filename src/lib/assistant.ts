import type { LlmConfig } from "@/lib/config";
import { streamCompletion, type LlmMessage } from "@/lib/llm";
import { executeTool, type ToolDef } from "@/lib/tools";

/**
 * assistant 응답 스트림 — 도구 루프(tool_calls 실행→재스트림, 최대 5회) 포함.
 * 텍스트는 즉시 enqueue, 종료 시 onDone(보인 전체 텍스트, 도구 호출 여부) 호출.
 * chat / regenerate 가 공유한다.
 */
export function runAssistantStream(opts: {
  conn: LlmConfig;
  llmMessages: LlmMessage[];
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

          usedTools = true;
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
