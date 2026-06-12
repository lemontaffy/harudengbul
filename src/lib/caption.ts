import { pickVisionConn, type LlmConfig } from "@/lib/config";
import { completeChat, type ChatMessage } from "@/lib/llm";
import { readUploadDataUrl } from "@/lib/uploads";
import * as messagesRepo from "@/db/repo/messages";

// 유틸리티 시스템 지시만 — 페르소나 프롬프트·역할 모듈은 절대 싣지 않는다.
const CAPTION_SYSTEM =
  "너는 이미지 설명 유틸리티다. 주어진 사진을 2~3문장으로 객관적으로 묘사한다. " +
  "보이는 것만 사실대로 적고 추측·감상·해석·말투·인사·이모지는 넣지 않는다. " +
  "사람의 이름 등 식별 정보를 추정하지 않는다.";

/** 단일 이미지 → 건조한 객관 캡션(2~3문장). 실패 시 null. */
export async function captionImage(
  conn: LlmConfig,
  dataUrl: string,
): Promise<string | null> {
  try {
    const messages: ChatMessage[] = [
      { role: "system", content: CAPTION_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "이 사진을 2~3문장으로 객관적으로 묘사해줘." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ];
    const text = (await completeChat(conn, messages)).trim();
    return text || null;
  } catch (e) {
    console.error("[caption] 생성 실패:", e);
    return null;
  }
}

/**
 * 메시지 첨부 사진에 캡션을 1회 생성·저장. 비전 연결 선택은 pickVisionConn(①aux ②첫 비전 ③null).
 * 실패/보류해도 throw 하지 않는다 — 대화를 막지 않는다.
 */
export async function captionMessage(
  userId: number,
  messageId: number,
): Promise<void> {
  try {
    const msg = await messagesRepo.getOne(userId, messageId);
    if (!msg?.attachmentPath || msg.attachmentCaption) return; // 없거나 이미 있으면 패스
    const conn = await pickVisionConn(userId);
    if (!conn) return; // ③ 비전 연결 없음 — 보류(다음 컨텍스트 조립 시 재시도)
    const dataUrl = await readUploadDataUrl(msg.attachmentPath);
    if (!dataUrl) return;
    const caption = await captionImage(conn, dataUrl);
    if (caption) await messagesRepo.setCaption(userId, messageId, caption);
  } catch (e) {
    console.error("[caption] message 캡션 실패:", e);
  }
}
