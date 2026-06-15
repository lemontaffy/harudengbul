// 아이템 '주기' 반응 — 전역 items 대상. 분기(주인 인식/일반/타펫+주인 언급) + 캐시 + aux 생성.
//   '주기'는 가끔 하는 의미 있는 제스처(빠른 반복 슬롯 아님): 쿨다운/캡은 give API가 담당.
import { completeChat } from "@/lib/llm";
import { forbiddenLine } from "@/lib/pets";
import { getPetAuxConfig } from "@/modules/pets/auxConfig";
import * as linesRepo from "@/db/repo/itemReactionLines";

// 캐시되는 kind(펫×아이템별 풀). repeat/owner_call 은 고정 풀(아래) — 캐시·LLM 없음.
export type GiveKind = "received" | "owner_recognize" | "other_owner";
export type EffectType = "sparkle" | "notes" | "hearts";

// 기본 템플릿({item}=아이템, {owner}=주인 이름). aux 미설정/실패 시 항상 동작.
const TEMPLATES: Record<GiveKind, string[]> = {
  received: ["{item}, 나 주는 거야?", "오, {item}!", "이게 뭐야, 신기해", "{item} 받았다!", "고마워, 잘 둘게"],
  owner_recognize: ["어, 내 {item}다!", "이거 내 거잖아 ㅎㅎ", "역시 {item}, 익숙해", "내 {item} 반가워"],
  other_owner: ["이거 {owner} 거 아냐?", "{owner} {item} 같은데…", "{owner}한테 받은 거 맞지?", "음, {owner} 거 같은데"],
};

// 고정 풀 — 연타 정착(repeat)·주인 부르기(owner_call). 캐시·LLM 없이 항상 차분.
const REPEAT_POOL = ["또?", "아까 봤어 ㅎㅎ", "응, 알아 알아", "그거 또구나", "방금 줬잖아~"];
const OWNER_CALL_POOL = ["어 그거 내 건데!", "{name}, 그거 내 거야~", "내 {item} 어디서 났어?", "그거 이리 줘 ㅎㅎ"];

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

export function effectFor(kind: GiveKind): EffectType {
  if (kind === "owner_recognize") return "hearts";
  if (kind === "other_owner") return "notes";
  return Math.random() < 0.5 ? "sparkle" : "notes";
}

function buildMessages(
  petName: string,
  personality: string | null,
  itemName: string,
  kind: GiveKind,
  ownerName?: string,
) {
  const what =
    kind === "owner_recognize"
      ? `자기 것인 '${itemName}'(을)를 다시 받아 '내 거다' 하고 알아보는 반가운 반응`
      : kind === "other_owner"
        ? `'${ownerName ?? "다른 친구"}'의 것인 '${itemName}'(을)를 받아 "이거 ${ownerName ?? "걔"} 거 아냐?" 하고 갸웃하는 반응`
        : `'${itemName}'(을)를 처음 받아 신기해하며 받는 반응`;
  const system = [
    `너는 '${petName}'(이)라는 펫이다.`,
    personality ? `성격: ${personality}` : "",
    `${what}을, 펫 1인칭 짧은 대사로 3개 만들어라.`,
    `규칙: 각 20자 내외, 그 펫다운 말투. 죽음·자해·비속어 금지. 따옴표·번호·머리말 없이`,
    `JSON 문자열 배열로만 출력. 예: ["...","...","..."]`,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: `'${itemName}' — ${kind} 반응 3개(JSON 배열):` },
  ];
}

function parseLines(raw: string): string[] {
  const t = raw.trim();
  try {
    const m = t.match(/\[[\s\S]*\]/);
    const arr = JSON.parse(m ? m[0] : t);
    if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
  } catch {
    return t.split("\n").map((s) => s.replace(/^[-*\d.\s"]+|["\s]+$/g, "").trim()).filter(Boolean).slice(0, 6);
  }
  return [];
}
function sanitize(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    const s = l.replace(/^["'“”]|["'“”]$/g, "").trim().slice(0, 40);
    if (!s || forbiddenLine(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * (이 아이템 × 받는 펫 × kind) 반응 풀을 보장하고 한 줄 반환.
 *   캐시 히트 → 재호출 없음. 미스 → aux 생성(실패/미설정 시 템플릿) 후 저장.
 *   '주기'는 의도적 제스처라 freq 코인플립 없이 캐시 미스 시 한 번 생성한다.
 */
export async function ensureGiveLine(
  userId: number,
  item: { id: number; name: string },
  pet: { id: number; name: string; personality: string | null },
  kind: GiveKind,
  ownerName?: string,
): Promise<string> {
  const cached = await linesRepo.listFor(item.id, pet.id, kind);
  if (cached.length) return pick(cached);

  let lines: string[] = [];
  try {
    const cfg = await getPetAuxConfig(userId);
    if (cfg.configured) {
      const raw = await completeChat(cfg, buildMessages(pet.name, pet.personality, item.name, kind, ownerName));
      lines = sanitize(parseLines(raw));
    }
  } catch {
    /* 생성 실패 → 템플릿 폴백 */
  }
  if (lines.length === 0) lines = fill(TEMPLATES[kind], item.name, ownerName);

  await linesRepo.addMany(item.id, pet.id, kind, "auto", lines);
  return pick(lines);
}
