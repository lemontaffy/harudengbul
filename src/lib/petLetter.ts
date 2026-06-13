// 펫 편지 답장 — 순수 헬퍼(프롬프트 빌드·폴백·딜레이). LLM 호출은 워커가.

import type { ChatMessage } from "@/lib/llm";
import { isLoveLabel, isHostileLabel } from "@/lib/pets";

export interface ReplyRelation {
  name: string;
  label: string;
}

/** 도착 딜레이(ms) — 즉답 금지. 10분 ~ 4시간 랜덤. */
export function randomDeliverDelayMs(): number {
  const min = 10 * 60_000;
  const max = 4 * 60 * 60_000;
  return Math.round(min + Math.random() * (max - min));
}

/** 관계 힌트 — 답장에 다른 펫을 자연스레 언급할 재료(강제 아님). */
function relationLine(rels: ReplyRelation[]): string {
  if (rels.length === 0) return "";
  const parts = rels.slice(0, 5).map((r) => {
    const kind = isLoveLabel(r.label) ? "연인" : isHostileLabel(r.label) ? "앙숙" : r.label;
    return `${r.name}(${kind})`;
  });
  return `- 다른 펫과의 관계: ${parts.join(", ")}. 자연스러우면 한 명 정도 슬쩍 언급해도 좋아(매번 강제 아님, 억지로 끼우지 말 것).`;
}

/** 답장 생성 메시지(system+user). 펫 1인칭·말투·성격 반영, 편지에 응답. */
export function buildReplyMessages(
  pet: { name: string; personality: string | null },
  letterContent: string,
  rels: ReplyRelation[],
): ChatMessage[] {
  const system = [
    `너는 '${pet.name}'(이)라는 펫이다. 주인이 너에게 보낸 손편지에 답장을 쓴다.`,
    pet.personality ? `너의 성격: ${pet.personality}` : "",
    `규칙:`,
    `- 1인칭, 펫의 말투와 성격을 살려서. 사람처럼 유창할 필요 없고 그 펫답게.`,
    `- 편지 내용에 진심으로 응답해(받은 말에 반응하고, 너의 하루나 마음도 조금).`,
    `- 3~6문장 정도. 너무 길지 않게. 마지막에 서명 같은 건 필요 없어.`,
    `- 죽음·자해 언급 금지. 비속어 원문 금지.`,
    relationLine(rels),
  ]
    .filter(Boolean)
    .join("\n");
  const user = `주인이 보낸 편지:\n"""\n${letterContent}\n"""\n\n위 편지에 '${pet.name}'(으)로서 답장해 줘.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 생성 실패 시 도착하는 기본 답장(편지가 영영 안 오면 안 됨). */
export function fallbackReply(petName: string): string {
  const pool = [
    `편지 잘 읽었어. 고마워, 마음이 따뜻해졌어.`,
    `네 편지 받았어! 또 써줘. 나도 너 생각 많이 해.`,
    `읽고 또 읽었어. 고마워, ${petName}는 늘 네 편이야.`,
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}
