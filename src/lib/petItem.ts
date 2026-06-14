// 아이템 반응 대사 — 캐싱 우선(조합당 1회 생성), 빈도 사용자 조절(항상/가끔/안 함).
//   흔한 건 템플릿, 특이한 건 aux LLM. 생성분은 item_reactions 에 저장 → 이후 재호출 X.
import { completeChat } from "@/lib/llm";
import { forbiddenLine } from "@/lib/pets";
import { getPetAuxConfig } from "@/modules/pets/auxConfig";
import * as reactionsRepo from "@/db/repo/itemReactions";

export type ReactionKind = reactionsRepo.ItemReactionKind; // 'receive'|'break'|'idle'
export type ReactionFreq = "always" | "sometimes" | "never";

// 기본 템플릿({item}=아이템 이름). LLM 없이도 항상 동작(흔한 아이템·'안 함' 설정).
const TEMPLATES: Record<ReactionKind, string[]> = {
  receive: ["{item}, 나 주는 거야?", "오, {item}! 고마워", "{item} 받았다!", "이거 내 거야? {item} 좋아", "{item}… 잘 간직할게"],
  break: ["앗, {item} 깨졌어…", "{item}가… 미안", "헉 {item} 망가졌다", "{item}, 그만 부서졌네…", "이런, {item}…"],
  idle: ["{item} 마음에 들어", "{item} 좋네", "이 {item} 괜찮은데"],
};

function fill(tpl: string[], item: string): string[] {
  return tpl.map((t) => t.replaceAll("{item}", item));
}

function buildMessages(petName: string, personality: string | null, itemName: string, kind: ReactionKind) {
  const what =
    kind === "receive"
      ? `주인에게 '${itemName}'(을)를 받은(또는 방에 놓인) 순간의 반응`
      : kind === "break"
        ? `'${itemName}'(이)가 망가져(파손) 버린 순간의 반응`
        : `'${itemName}'(을)를 가만히 두고 보는 평소 한마디`;
  const system = [
    `너는 '${petName}'(이)라는 펫이다.`,
    personality ? `성격: ${personality}` : "",
    `${what}을, 펫 1인칭 짧은 대사로 4개 만들어라.`,
    `규칙: 각 12자 내외, 그 펫다운 말투·성격. 죽음·자해·비속어 금지. 따옴표·번호·머리말 없이`,
    `JSON 문자열 배열로만 출력. 예: ["...","...","...","..."]`,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: `'${itemName}' — ${kind} 반응 4개(JSON 배열):` },
  ];
}

function parseLines(raw: string): string[] {
  const t = raw.trim();
  let arr: unknown = null;
  try {
    const m = t.match(/\[[\s\S]*\]/);
    arr = JSON.parse(m ? m[0] : t);
  } catch {
    // JSON 실패 → 줄 단위 폴백
    return t.split("\n").map((s) => s.replace(/^[-*\d.\s"]+|["\s]+$/g, "").trim()).filter(Boolean).slice(0, 6);
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
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
 * (이 펫 × 이 아이템 × kind) 반응 풀을 보장하고 반환.
 *   캐시 히트 → 그대로(LLM 미호출). 미스 → 빈도 정책대로 LLM 또는 템플릿 생성 후 저장.
 *   freq='never' → 항상 템플릿. 'always' → LLM(실패 시 템플릿). 'sometimes' → 절반은 템플릿.
 */
export async function ensureReactions(
  userId: number,
  item: { id: number; name: string },
  pet: { id: number; name: string; personality: string | null },
  kind: ReactionKind,
  freq: ReactionFreq,
): Promise<string[]> {
  const cached = await reactionsRepo.listFor(item.id, pet.id, kind);
  if (cached.length) return cached; // 캐시 히트 — 재호출 없음

  const templates = fill(TEMPLATES[kind], item.name);
  const useLlm = freq === "always" || (freq === "sometimes" && Math.random() < 0.5);

  let lines: string[] = [];
  if (useLlm) {
    try {
      const cfg = await getPetAuxConfig(userId);
      if (cfg.configured) {
        const raw = await completeChat(cfg, buildMessages(pet.name, pet.personality, item.name, kind));
        lines = sanitize(parseLines(raw));
      }
    } catch {
      /* 생성 실패 → 템플릿 폴백 */
    }
  }
  if (lines.length === 0) lines = templates;

  await reactionsRepo.addMany(item.id, pet.id, kind, lines);
  return lines;
}

export function pickReaction(pool: string[], fallbackItem: string): string {
  if (pool.length === 0) return fill(TEMPLATES.idle, fallbackItem)[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

// 파손 시 같은 방 둘째 펫의 관계 반영 페어 반응(템플릿) + 이펙트.
//   혐관 → 책임 전가(💢), 연인 → 같이 시치미(❤️), 형제·가족 → 투닥, 그 외 → 중립.
export function pairBreakLine(
  relationLabel: string | null,
  isLove: boolean,
  otherName: string,
): { content: string; effect: "anger" | "hearts" | null } {
  const label = (relationLabel ?? "").toLowerCase();
  const hostile = /혐관|앙숙|라이벌|rival|적|싫/.test(label);
  const family = /형제|남매|자매|가족|sibling|brother|sister|family|쌍둥이/.test(label);
  if (hostile)
    return { content: `${otherName}가 그랬어! 난 안 그랬어`, effect: "anger" };
  if (isLove) return { content: `우리… 못 본 걸로 하자`, effect: "hearts" };
  if (family) return { content: `야 ${otherName}, 네가 깼지!`, effect: null };
  return { content: `${otherName}, 봤어? 깨졌어…`, effect: null };
}
