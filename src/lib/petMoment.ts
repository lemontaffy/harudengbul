// 펫 관계 이벤트 씬 생성 — '보기' 탭 시 메인 모델 1회 생성. 태그 시퀀스 출력 → 저장본 재생(재생성 X).
//   톤: 대치=정극 다큐 나레이션 + 만담 말풍선 / 애정=능청 나레이션 + 다정 말풍선.
//   메인 실패 시 aux → 하드코딩 폴백. 내용: 진심 없는 험담·욕설류 허용(펫끼리), 죽음·자해 제외.
import { completeChat } from "@/lib/llm";
import { getLlmConfig } from "@/lib/config";
import { getPetAuxConfig } from "@/modules/pets/auxConfig";
import type { MomentLine } from "@/db/schema";

type PetRef = { id: number; name: string; personality: string | null };
export type RelationKind = "hostile" | "love";

const MAX_LINES = 9;

function buildMessages(a: PetRef, b: PetRef, kind: RelationKind, relationLabel: string) {
  const tone =
    kind === "hostile"
      ? `대치(혐관/라이벌) 씬. 나레이터는 정극 다큐멘터리처럼 진지·과장되게 깔고, 두 펫은 티격태격 만담을 주고받는다. 진심 없는 험담·"꺼져" 같은 가벼운 욕설류 OK(서로에게, 사용자 향하지 않음).`
      : `애정(연인/단짝) 씬. 나레이터는 능청스럽게 놀리듯 깔고, 두 펫은 다정·간질간질하게 주고받는다.`;
  const system = [
    `너는 펫 토이박스의 '관계 이벤트' 짧은 씬 작가다.`,
    `등장: A='${a.name}'(성격: ${a.personality ?? "표현 풍부"}), B='${b.name}'(성격: ${b.personality ?? "표현 풍부"}). 둘의 관계: ${relationLabel}.`,
    tone,
    `구성: 셋업 → 전개 → 펀치라인. 5~8줄. 나레이터와 펫 대사를 번갈아.`,
    `규칙: 자연스러운 한국어. 죽음·자해 언급 금지. 행동지문은 나레이터 줄에만(펫 줄은 대사). 각 줄 30자 내외.`,
    `출력은 JSON 배열로만. 각 원소 {"speaker":"narrator"|"a"|"b","text":"..."}. 예:`,
    `[{"speaker":"narrator","text":"..."},{"speaker":"a","text":"..."},{"speaker":"b","text":"..."}]`,
  ].join("\n");
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: `'${a.name}'와 '${b.name}'의 ${kind === "hostile" ? "대치" : "애정"} 씬(JSON 배열):` },
  ];
}

function parseScene(raw: string, aId: number, bId: number): MomentLine[] {
  let arr: unknown;
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    arr = JSON.parse(m ? m[0] : raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: MomentLine[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const o = it as { speaker?: string; text?: string };
    const text = String(o.text ?? "").trim().slice(0, 60);
    if (!text || /자살|목\s?매|손목\s?긋|죽어\s?버|뒤져\s?버/.test(text)) continue;
    if (o.speaker === "narrator") out.push({ type: "narrator", text });
    else if (o.speaker === "a") out.push({ type: "pet", petId: aId, text });
    else if (o.speaker === "b") out.push({ type: "pet", petId: bId, text });
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

function fallbackScene(a: PetRef, b: PetRef, kind: RelationKind): MomentLine[] {
  if (kind === "hostile") {
    return [
      { type: "narrator", text: `두 펫의 시선이 허공에서 맞부딪힌다.` },
      { type: "pet", petId: a.id, text: `또 너야? 비켜.` },
      { type: "pet", petId: b.id, text: `흥, 내가 먼저 왔거든?` },
      { type: "narrator", text: `팽팽한 긴장… 그러나 결국,` },
      { type: "pet", petId: a.id, text: `…간식은 반씩 하자.` },
      { type: "pet", petId: b.id, text: `그건 또 마음에 드네.` },
    ];
  }
  return [
    { type: "narrator", text: `오늘도 둘은 붙어 다닌다, 수상할 만큼.` },
    { type: "pet", petId: a.id, text: `${b.name}, 옆에 좀 와봐.` },
    { type: "pet", petId: b.id, text: `왜, 또 보고 싶었어?` },
    { type: "narrator", text: `누가 봐도 알겠는 분위기.` },
    { type: "pet", petId: a.id, text: `…응. 그런 거 같아.` },
  ];
}

/** 씬 1회 생성 — 메인 모델 우선, 실패 시 aux, 둘 다 실패 시 하드코딩 폴백. 항상 유효한 시퀀스 반환. */
export async function generateScene(
  userId: number,
  a: PetRef,
  b: PetRef,
  kind: RelationKind,
  relationLabel: string,
): Promise<MomentLine[]> {
  const messages = buildMessages(a, b, kind, relationLabel);
  for (const getCfg of [() => getLlmConfig(userId), () => getPetAuxConfig(userId)]) {
    try {
      const cfg = await getCfg();
      if (!cfg.configured) continue;
      const raw = await completeChat(cfg, messages);
      const scene = parseScene(raw, a.id, b.id);
      if (scene.length >= 3) return scene;
    } catch {
      /* 다음 폴백 */
    }
  }
  return fallbackScene(a, b, kind);
}
