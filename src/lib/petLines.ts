import { getPetAuxConfig } from "@/modules/pets/auxConfig";
import { completeChat } from "@/lib/llm";
import { forbiddenLine, type Stage } from "@/lib/pets";
import * as petsRepo from "@/db/repo/pets";
import * as petRelationsRepo from "@/db/repo/petRelations";
import * as petLinesRepo from "@/db/repo/petLines";

const STAGE_TONE: Record<Stage, string> = {
  baby: "아기(새끼) 단계 — 옹알이처럼 짧고 미숙한 소리. 의미보다 귀여운 음성 위주.",
  teen: "청소년 단계 — 발랄하고 장난스럽게. 에너지 넘치는 짧은 말.",
  adult: "어른 단계 — 성격을 본격 반영해 차분하거나 개성 있게.",
};

function soloPrompt(stage: Stage, personality: string | null): string {
  return [
    `펫이 혼자 중얼거리는 짧은 한 마디 15개를 만들어.`,
    `- 톤: ${STAGE_TONE[stage]}`,
    personality ? `- 성격 참고: ${personality}` : "",
    `- 각 20자 내외. 사용자에게 말 거는 게 아니라 펫의 혼잣말.`,
    `- 죽음·자해 언급 금지. 비속어 원문 금지.`,
    `- 출력은 JSON 문자열 배열만. 예: ["뀨?","데굴데굴"]`,
  ]
    .filter(Boolean)
    .join("\n");
}

function aboutPrompt(stage: Stage, selfName: string, otherName: string, label: string): string {
  return [
    `'${selfName}'(이 펫)가 다른 펫 '${otherName}'에 대해 하는 짧은 혼잣말 5개를 만들어.`,
    `- 둘의 관계: "${label}". 이 관계의 결을 따른다.`,
    `- 적대 관계(라이벌·혐관 등)면 만담형 투닥("꺼져" 류·유치한 싸움·진심 없는 험담) 허용.`,
    `- 단, 펫끼리의 말이며 사용자를 향하지 않는다. 톤: ${STAGE_TONE[stage]}`,
    `- 각 20자 내외. 죽음·자해 언급 금지, 비속어 원문 금지.`,
    `- 출력은 JSON 문자열 배열만.`,
  ].join("\n");
}

// 모델 출력에서 JSON 문자열 배열 추출(코드펜스·잡텍스트 관용).
function parseLines(text: string): string[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  } catch {
    return [];
  }
}

/**
 * 해당 (펫, 스테이지) 자동 대사 풀 재생성. solo 15 + 관계 상대별 about_other 5.
 * 금지(죽음/자해·비속어) 필터. aux 미설정/실패 시 스킵(렌더 시 DEFAULT 폴백).
 * 생성·저장한 대사 수를 반환(0=미설정/실패로 미변경). 자동 훅 호출부는 void 로 fire-and-forget.
 */
export async function regenerateLines(userId: number, petId: number, stage: Stage): Promise<number> {
  const pet = await petsRepo.getOne(userId, petId);
  if (!pet) return 0;
  const cfg = await getPetAuxConfig(userId);
  if (!cfg.configured) return 0;

  const out: { kind: "solo" | "about_other"; aboutPetId: number | null; content: string }[] = [];

  // solo
  try {
    const text = await completeChat(cfg, [
      { role: "system", content: "너는 펫 대사 생성기다. 요청 형식(JSON 배열)만 출력한다." },
      { role: "user", content: soloPrompt(stage, pet.personality) },
    ]);
    for (const line of parseLines(text)) {
      if (!forbiddenLine(line)) out.push({ kind: "solo", aboutPetId: null, content: line });
    }
  } catch {
    /* solo 실패 — 그대로 진행 */
  }

  // about_other (관계 상대별)
  const relations = await petRelationsRepo.listForPet(userId, petId);
  for (const rel of relations) {
    const otherId = rel.petAId === petId ? rel.petBId : rel.petAId;
    const other = await petsRepo.getOne(userId, otherId);
    if (!other) continue;
    try {
      const text = await completeChat(cfg, [
        { role: "system", content: "너는 펫 대사 생성기다. JSON 배열만 출력한다." },
        {
          role: "user",
          content: aboutPrompt(stage, pet.name, other.name, rel.relationLabel),
        },
      ]);
      for (const line of parseLines(text)) {
        if (!forbiddenLine(line)) out.push({ kind: "about_other", aboutPetId: otherId, content: line });
      }
    } catch {
      /* 이 상대 실패 — 다음 상대로 */
    }
  }

  if (out.length) await petLinesRepo.replaceAuto(petId, stage, out);
  return out.length;
}

/** 펫의 모든 관계 상대에 대해, 그리고 자기 자신 stage 풀을 재생성(관계 변경 시 양쪽 갱신용). */
export async function regenerateForPair(userId: number, petAId: number, petBId: number, stage: Stage) {
  await regenerateLines(userId, petAId, stage);
  await regenerateLines(userId, petBId, stage);
}
