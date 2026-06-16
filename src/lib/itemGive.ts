// 펫 반응 — v4 라이브 생성. 상호작용(던지기/급여)마다 aux(보조 모델, Gemini Flash) 1회 호출 → 그 자리 생성.
//   사전 풀 추첨 아님(캐시 X). 실패·미설정·레이트리밋 → 하드코딩 폴백 풀로 즉시 대체(끊김 0).
//   톤: 짧지만 강렬, 성격 과장해 드라마틱+웃기게. 캐릭터다우면 가벼운 욕설·모국어 OK.
import { completeChat } from "@/lib/llm";
import { getPetAuxConfig } from "@/modules/pets/auxConfig";

export type GiveKind = "received" | "owner_recognize" | "other_owner" | "eating";
export type EffectType = "sparkle" | "notes" | "hearts";

// 재미 톤 샘플링(작업 지시 B).
const FUN_OPTS = { temperature: 0.95, topP: 0.92, topK: 60 } as const;

// 폴백 풀({item}=아이템, {owner}=주인). aux 실패/미설정 시 즉시 대체(끊김 0).
const TEMPLATES: Record<GiveKind, string[]> = {
  received: ["{item}?! 이게 웬 떡이야!", "오오 {item}! 나 주는 거 맞지?!", "{item}이라니… 심장 떨려", "헉 {item}, 잘 간직할게!!"],
  owner_recognize: ["내 {item}!! 드디어 돌아왔구나", "이거 내 거잖아, 어딨었어 ㅠㅠ", "역시 {item}, 손에 착 붙네", "내 {item} 반가워 죽겠다"],
  other_owner: ["잠깐, 이거 {owner} 거 아냐?!", "{owner} {item}인데… 나 가져도 돼?", "{owner}한테 혼나는 거 아냐 이거", "음… {owner} 냄새 나는데 이거"],
  eating: ["냠냠! {item} 최고야!!", "{item}… 우물우물… 천국", "꿀꺽! {item} 더 없어?!", "오 {item}, 이거 좀 하는데?"],
};
const REPEAT_POOL = ["또?!", "아까 봤다니까 ㅎㅎ", "응 응 알아 알아~", "방금 줬잖아 욕심쟁이"];
const OWNER_CALL_POOL = ["야!! 그거 내 건데!", "{name}, 그거 내 거라고~", "내 {item} 어디서 났어 너!", "이리 내놔 그거 ㅋㅋ"];
const FULL_POOL = ["으윽… 아직 배불러", "방금 먹었잖아 ㅠ", "지금은 진짜 못 먹어…", "조금만 있다 줘, 터질 것 같아"];

function fill(tpl: string[], item: string, owner?: string): string[] {
  return tpl.map((t) => t.replaceAll("{item}", item).replaceAll("{owner}", owner ?? "주인"));
}
function pick(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? "…";
}

export function repeatLine(): string {
  return pick(REPEAT_POOL);
}
export function ownerCallLine(itemName: string, recipientName: string): string {
  return pick(OWNER_CALL_POOL).replaceAll("{item}", itemName).replaceAll("{name}", recipientName);
}
export function fullLine(): string {
  return pick(FULL_POOL);
}

export function effectFor(kind: GiveKind): EffectType {
  if (kind === "owner_recognize") return "hearts";
  if (kind === "other_owner") return "notes";
  if (kind === "eating") return Math.random() < 0.5 ? "sparkle" : "hearts";
  return Math.random() < 0.5 ? "sparkle" : "notes";
}

// 반응 전용 금지선(재미와 무관한 실제 선만). 가벼운 욕설·감탄사는 허용(재미 톤).
const HARD_BLOCK =
  /(자살|목\s?매|손목\s?긋|죽어\s?버|뒤져\s?라|뒤져\s?버|강간|성폭|아동.*성|미성년.*성)/;
function clean(s: string): string {
  return s
    .replace(/^["'“”\s\-*\d.]+|["'“”\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function buildPrompt(
  petName: string,
  personality: string | null,
  itemName: string,
  kind: GiveKind,
  ownerName?: string,
) {
  const what =
    kind === "eating"
      ? `방금 '${itemName}'(을)를 받아 먹었다. 성격·취향대로 황홀해하거나, 안 맞으면 질색하며 솔직히 싫어해도 된다(억지로 좋아하지 말 것).`
      : kind === "owner_recognize"
        ? `자기 것인 '${itemName}'(을)를 다시 받았다. '내 거다!' 하고 격하게 반가워한다.`
        : kind === "other_owner"
          ? `'${ownerName ?? "다른 친구"}'의 것인 '${itemName}'(을)를 받았다. "이거 ${ownerName ?? "걔"} 거 아냐?!" 하고 갸웃·당황한다.`
          : `'${itemName}'(을)를 처음 받았다. 신기해하며 호들갑스럽게 받는다.`;
  const system = [
    `너는 '${petName}'(이)라는 펫이다.`,
    personality ? `성격: ${personality}` : "성격: 장난기 많고 표현이 풍부함",
    `이 상황에 그 성격을 과장해서 드라마틱하고 웃기게 반응해라. 밋밋한 한 줄 절대 금지.`,
    `캐릭터다우면 가벼운 욕설·감탄사·모국어 한 마디(예: Porca…) 환영, 하이퍼볼리 좋아.`,
    `단 이건 진짜 금지: 죽음·자해를 진지하게 / 미성년 부적절 / 실제 혐오.`,
    `자연스러운 한국어. 펫 1인칭 대사 딱 한 줄(25자 내외). 행동지문·따옴표·번호·머리말 없이 대사만.`,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: `${what}\n→ 한 줄 대사:` },
  ];
}

/**
 * 라이브 1줄 생성(캐시 없음). 매번 aux 1회 호출 → 실패/미설정/금지선 → 폴백 풀.
 *   (kind·맥락별 분기는 호출부에서 결정해 넘긴다.)
 */
export async function ensureGiveLine(
  userId: number,
  item: { id: number; name: string },
  pet: { id: number; name: string; personality: string | null },
  kind: GiveKind,
  ownerName?: string,
): Promise<string> {
  try {
    const cfg = await getPetAuxConfig(userId);
    if (cfg.configured) {
      const raw = await completeChat(cfg, buildPrompt(pet.name, pet.personality, item.name, kind, ownerName), undefined, FUN_OPTS);
      const line = clean((raw ?? "").split("\n").find((l) => l.trim()) ?? "");
      if (line && !HARD_BLOCK.test(line)) return line;
    }
  } catch {
    /* 호출 실패 → 폴백 */
  }
  return pick(fill(TEMPLATES[kind], item.name, ownerName));
}
