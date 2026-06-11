import type { LlmConfig } from "@/lib/config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// tool-use 메시지(어시스턴트 tool_calls / tool 결과 포함)
export interface LlmToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}
export type StreamEvent =
  | { type: "text"; value: string }
  | { type: "tool_calls"; calls: ToolCall[] };

interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: object };
}

function normBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/**
 * OpenAI 호환 /chat/completions 비스트리밍 1회 호출 → 전체 텍스트 반환.
 * 일기 답장처럼 스트리밍이 필요 없는 단발 생성에 사용.
 */
export async function completeChat(
  conn: LlmConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${normBase(conn.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: conn.model, messages, stream: false }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status} ${detail.slice(0, 200)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

/**
 * OpenAI 호환 /chat/completions 스트리밍.
 * SSE(data: {...}) 청크에서 choices[0].delta.content 만 yield.
 */
export async function* streamChatCompletion(
  conn: LlmConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch(`${normBase(conn.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: conn.model,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status} ${detail.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      } catch {
        // 부분 청크 — 무시(다음 줄에서 이어짐)
      }
    }
  }
}

/**
 * OpenAI 호환 스트리밍 + tool-use. 텍스트 델타는 즉시 yield,
 * tool_calls 델타는 index 별로 누적해 스트림 종료 시 1번에 yield.
 * tools 미지정이면 일반 스트리밍과 동일(텍스트만).
 */
export async function* streamCompletion(
  conn: LlmConfig,
  messages: (LlmMessage | ChatMessage)[],
  opts?: { tools?: ToolSpec[] },
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const body: Record<string, unknown> = {
    model: conn.model,
    messages,
    stream: true,
  };
  if (opts?.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(`${normBase(conn.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status} ${detail.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const acc: Record<number, { id: string; name: string; arguments: string }> = {};
  let sawTool = false;
  let done = false;

  while (!done) {
    const { done: rd, value } = await reader.read();
    if (rd) break;
    buf += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        done = true;
        break;
      }
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta;
        if (typeof delta?.content === "string" && delta.content) {
          yield { type: "text", value: delta.content };
        }
        if (Array.isArray(delta?.tool_calls)) {
          sawTool = true;
          for (const tc of delta.tool_calls) {
            const idx: number = typeof tc.index === "number" ? tc.index : 0;
            const cur = (acc[idx] ??= { id: "", name: "", arguments: "" });
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name = tc.function.name;
            if (typeof tc.function?.arguments === "string") {
              cur.arguments += tc.function.arguments;
            }
          }
        }
      } catch {
        // 부분 청크 — 무시
      }
    }
  }

  if (sawTool) {
    const calls = Object.keys(acc)
      .map(Number)
      .sort((a, b) => a - b)
      .map((k) => acc[k])
      .filter((c) => c.name);
    if (calls.length) yield { type: "tool_calls", calls };
  }
}
