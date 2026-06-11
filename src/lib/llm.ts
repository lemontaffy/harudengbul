import type { LlmConfig } from "@/lib/config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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
