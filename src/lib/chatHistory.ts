import { type ChatMessage, type ContentPart, type LlmMessage } from "@/lib/llm";
import { readUploadDataUrl } from "@/lib/uploads";
import { captionMessage } from "@/lib/caption";

export interface HistRow {
  id: number;
  role: string; // user | assistant | proactive
  content: string;
  attachmentPath: string | null;
  attachmentCaption: string | null;
}

/**
 * 히스토리 → LLM 메시지 변환(#6).
 *  - 현재 연결이 비전 지원: 최근 이미지 2장까지 실제 이미지 블록(image_url),
 *    그보다 오래된 건 "[사진: {caption}]" 텍스트.
 *  - 비전 미지원: 모든 이미지 메시지를 "[사진: {caption}]"(caption null → "[사진 — 내용 확인 불가]").
 *  - caption 이 null 인 메시지는 1회 재캡션을 비동기로 재시도(대화를 막지 않음).
 */
export async function toLlmHistory(
  userId: number,
  history: HistRow[],
  supportsVision: boolean,
): Promise<(LlmMessage | ChatMessage)[]> {
  const imageIdx = history.flatMap((m, i) => (m.attachmentPath ? [i] : []));
  const recentImages = new Set(imageIdx.slice(-2));

  const out: (LlmMessage | ChatMessage)[] = [];
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    const role = m.role === "user" ? ("user" as const) : ("assistant" as const);
    if (!m.attachmentPath) {
      out.push({ role, content: m.content });
      continue;
    }
    // caption 보류분 — 1회 재시도(비동기). 이번 턴은 텍스트 대체물로 진행.
    if (!m.attachmentCaption) void captionMessage(userId, m.id);

    if (supportsVision && recentImages.has(i)) {
      const dataUrl = await readUploadDataUrl(m.attachmentPath);
      if (dataUrl) {
        const parts: ContentPart[] = [];
        if (m.content.trim()) parts.push({ type: "text", text: m.content });
        parts.push({ type: "image_url", image_url: { url: dataUrl } });
        out.push({ role, content: parts });
        continue;
      }
    }
    const cap = m.attachmentCaption
      ? `[사진: ${m.attachmentCaption}]`
      : "[사진 — 내용 확인 불가]";
    out.push({ role, content: m.content.trim() ? `${m.content}\n${cap}` : cap });
  }
  return out;
}
