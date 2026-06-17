// 펫 일기 — 순수 헬퍼(프롬프트 빌드·폴백). LLM 호출은 API 라우트가.
import type { ChatMessage } from "@/lib/llm";
import { isLoveLabel, isHostileLabel, type Stage } from "@/lib/pets";

export interface DiaryRelation {
  name: string;
  label: string;
}
export interface DiaryOther {
  name: string;
  personality: string | null;
  stage: Stage;
}
export interface DiaryPetCtx {
  name: string;
  personality: string | null;
  stage: Stage;
  roommates: string[]; // 같은 방 다른 펫 이름
  relations: DiaryRelation[];
  others: DiaryOther[]; // 다른 펫들의 실제 정보(성격·단계) — 사실 왜곡 방지용 참고
}

const STAGE_TONE: Record<Stage, string> = {
  baby: "아기 단계 — 서툴고 단순한 관찰, 짧게.",
  teen: "청소년 단계 — 발랄하거나 툴툴대는 솔직한 기록.",
  adult: "어른 단계 — 성격이 더 짙게 묻어나는 독백.",
};

const STAGE_KO: Record<Stage, string> = { baby: "아기", teen: "청소년", adult: "어른" };

// 다른 펫들의 실제 정보 블록 — 일기에서 그 펫을 언급할 때 사실(성격·단계)을 지어내지 않도록.
function othersBlock(others: DiaryOther[]): string {
  if (others.length === 0) return "";
  const lines = others
    .slice(0, 10)
    .map((o) => `  · ${o.name}: ${o.personality?.trim() || "성격 정보 없음"} (${STAGE_KO[o.stage]})`)
    .join("\n");
  return [
    `- 다른 펫들의 실제 정보(아래 사실만 사용 — 성격·종·말투·관계를 임의로 지어내지 말 것):`,
    lines,
  ].join("\n");
}

function relationLine(rels: DiaryRelation[]): string {
  if (rels.length === 0) return "";
  const parts = rels.slice(0, 5).map((r) => {
    const kind = isLoveLabel(r.label) ? "마음에 두는" : isHostileLabel(r.label) ? "거슬리는" : r.label;
    return `${r.name}(${kind} 사이)`;
  });
  return `- 관계: ${parts.join(", ")}. 일기에 한 명 정도 자기 시점으로 슬쩍 언급해도 좋다(억지 금지). 험관이면 투덜대듯, 연인이면 은근하게.`;
}

/** 펫 한 명의 '훔쳐본 일기' 생성 메시지. 1인칭 일기체, 성격 반영, 1~3문장. */
export function buildDiaryMessages(pet: DiaryPetCtx): ChatMessage[] {
  const system = [
    `너는 '${pet.name}'(이)라는 펫이다. 주인이 안 볼 때 몰래 쓴 듯한 짧은 하루 일기를 쓴다.`,
    pet.personality ? `너의 성격: ${pet.personality}` : "",
    `톤: ${STAGE_TONE[pet.stage]} 1인칭 일기체. 성격이 말투·관점에 진하게 묻어나게(능청·소심·무뚝뚝·건조한 관찰·최소한의 단어 등 그 펫답게).`,
    `- 1~3문장. 사람처럼 유창할 필요 없다. 주인에게 말 거는 게 아니라 혼자만의 기록.`,
    pet.roommates.length ? `- 같은 방 친구들: ${pet.roommates.join(", ")}.` : "",
    relationLine(pet.relations),
    othersBlock(pet.others),
    `- 죽음·자해·비속어 금지. 무겁게 가지 말고 펫의 사소한 하루.`,
    `- 일기 본문만 출력(따옴표·머리말·날짜 없이).`,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: `오늘 '${pet.name}'의 일기를 한 편 써 줘.` },
  ];
}

/** 사용자 tz 기준 오늘 YYYY-MM-DD(자정 경계). 페이지·생성 API 가 같은 값을 쓰게 공유. */
export function diaryDateInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/** 생성 실패 시 폴백 일기(빈 일기는 없도록). */
export function fallbackDiary(name: string): string {
  const pool = [
    `오늘도 별일 없었다. 그래도 나쁘지 않은 하루.`,
    `창밖을 한참 봤다. ${name}는 그런 걸 좋아한다.`,
    `밥 먹고 한숨 잤다. 평화로웠다.`,
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}
