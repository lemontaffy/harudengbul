// 펫 편지 답장 — 순수 헬퍼(프롬프트 빌드·폴백·딜레이). LLM 호출은 워커가.

import type { ChatMessage } from "@/lib/llm";
import { isLoveLabel, isHostileLabel, forbiddenLine } from "@/lib/pets";

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

/** 그동안 이 펫이 사용자와 쌓은 추억(지난 편지 등) — 답장에 자연스러운 연속성 부여. */
function memoryLine(memories: string[]): string {
  const xs = memories.map((m) => m.trim()).filter(Boolean).slice(0, 8);
  if (xs.length === 0) return "";
  return (
    `- 너와 주인이 그동안 편지로 쌓은 기억(자연스럽게 떠올려도 좋아, 억지로 다 쓰지 말 것):\n` +
    xs.map((m) => `  · ${m}`).join("\n")
  );
}

/** 답장 생성 메시지(system+user). 펫 1인칭·말투·성격 반영, 편지에 응답. memories=그 펫의 'pet' 추억만. */
// 펫 편지 답장 샘플링 — 캐릭터 voice 가 살도록 다양성 높게. completeChat 에 전달.
export const REPLY_SAMPLING = { temperature: 0.95, topP: 0.92, topK: 60 };

export function buildReplyMessages(
  pet: { name: string; personality: string | null },
  letterContent: string,
  rels: ReplyRelation[],
  memories: string[] = [],
): ChatMessage[] {
  const system = [
    `너는 '${pet.name}'(이)고, 주인이 보낸 손편지에 그 캐릭터로서 답장을 쓴다.`,
    pet.personality ? `너의 성격: ${pet.personality}` : "",
    `지킬 것:`,
    `- 1인칭 편지 voice만. 펫이 직접 쓴 말. 받은 편지에 진심으로 응답하고(받은 말에 반응), 너의 하루나 마음도 조금 담아.`,
    `- ⚠ 행동지문 금지 — "고개 끄덕이고", "입꼬리 올라감" 같은 제3자 시점 행동·표정 묘사를 넣지 말 것. 편지는 쓴 말이지 연출이 아니다. 감정은 말투·단어로만 드러낸다.`,
    `- 자연스러운 한국어. 사전에 없는 단어·어색한 음차를 만들지 말 것(예: "저주스"(X) → "저주를"(O)).`,
    `- 등장인물·세계관 용어는 새로 짓거나 변형해도 되지만, 한국어 욕설을 연상시키는 단어(예: "패드리노"는 패드립 연상)는 삼간다.`,
    `- 성격·관계를 반영하고, 길이는 편지답게 2~5문장. 마지막에 서명 같은 건 필요 없다.`,
    `- 죽음·자해 언급 금지. 심한 한글 비속어 금지(비속어 원문 금지).`,
    memoryLine(memories),
    relationLine(rels),
    `말투 예시(전부 1인칭 · 행동지문 없음 · 자연스러운 한국어 — 이 결을 따른다):`,
    `· 거칠고 직설적인 결: "Cazzo! 지금 뭘 하는 거야?! 피자에 파인애플?! 날 죽이려고 작정했어?! 네로, 맹세컨대, 내 늑대한테 그걸 먹이면 이 도시를 다 불태워버릴 거야!"`,
    `· 차분·관찰형 결: "알겠어. 루시안이 한참 헤맬 것 같긴 한데… 그래도 하나쯤은 남겨두지 그랬어."`,
  ]
    .filter(Boolean)
    .join("\n");
  const user = `주인이 보낸 편지:\n"""\n${letterContent}\n"""\n\n위 편지에 '${pet.name}'(으)로서 답장해 줘.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * 편지 교환에서 '펫과 쌓을 추억' 한 줄을 뽑는 메시지.
 * ★ 민감/사적 정보(건강·질병·ADHD·약·진단·증상 등)는 추억으로 만들지 않는다 — 추출 단계에서 배제.
 * 적당한 추억이 없으면 정확히 "없음" 만 출력하게 한다(호출부가 거른다).
 */
export function buildMemoryExtractMessages(
  pet: { name: string },
  letterContent: string,
  replyContent: string,
): ChatMessage[] {
  const system = [
    `너는 펫 '${pet.name}'의 기억을 정리하는 보조자다. 아래 '주인의 편지'와 '펫의 답장'에서,`,
    `펫이 주인과 오래 간직할 만한 따뜻하고 소소한 '추억' 한 줄을 펫 시점("나는/우리는 …")으로 적어라.`,
    `규칙:`,
    `- 딱 한 문장, 40자 내외. 군더더기·따옴표·머리말 없이 추억 문장만.`,
    `- ★ 건강·질병·ADHD·우울·약·진단·증상 같은 사적/민감 정보는 절대 추억으로 만들지 않는다.`,
    `  (그런 내용뿐이라 적을 게 없으면 정확히 "없음" 이라고만 출력한다.)`,
    `- 일정·할 일·수치 같은 업무성 정보도 추억이 아니다 — 제외.`,
    `- 주인이 펫에게 보인 애정, 함께한 약속·소망, 좋아하는 것, 같이 느낀 감정 위주로.`,
  ].join("\n");
  const user = `주인의 편지:\n"""\n${letterContent}\n"""\n\n펫의 답장:\n"""\n${replyContent}\n"""\n\n추억 한 줄(없으면 "없음"):`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 추출된 추억 문자열 정제 — 빈/없음/과장/금칙이면 빈 문자열(저장 안 함). */
export function sanitizePetMemory(raw: string): string {
  let s = (raw || "").trim().replace(/^["'“”]|["'“”]$/g, "").trim();
  if (!s) return "";
  if (/^(없음|없어요?|없다|none|n\/a|-)\.?$/i.test(s)) return "";
  if (s.length > 120) s = s.slice(0, 120).trim();
  if (forbiddenLine(s)) return ""; // 죽음·자해·비속어 원문 차단(펫 라인과 동일 기준)
  return s;
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
