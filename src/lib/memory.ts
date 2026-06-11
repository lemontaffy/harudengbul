import type { LlmConfig } from "@/lib/config";
import { completeChat } from "@/lib/llm";

// 장기기억 추출 — 대화/일기에서 "기억할 가치가 있는" 사실만 뽑는다.
export interface MemoryCandidate {
  content: string;
  importance: number; // 1~5
}

const EXTRACT_SYSTEM = `너는 대화/일기에서 '장기적으로 기억할 가치가 있는' 사실만 뽑는 추출기다.
- 사용자에 관한 지속적 사실·선호·관계·목표·반복 습관·중요한 사건만 뽑는다.
- 일시적 잡담, 단순 인사, 한 번뿐인 사소한 일은 제외한다.
- 각 항목은 한국어 한 문장, 3인칭 서술로(예: "사용자는 고양이 나비를 키운다").
- 비슷한 항목은 합쳐 하나로. importance 는 1(사소)~5(매우 중요).
출력은 JSON 배열만: [{"content": string, "importance": number}]. 기억할 게 없으면 []. 다른 텍스트는 금지.`;

/** LLM 출력(잡텍스트/코드펜스 섞일 수 있음)에서 후보 배열을 견고하게 파싱. */
export function parseMemoryCandidates(raw: string): MemoryCandidate[] {
  if (!raw) return [];
  let s = raw.trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  s = s.slice(start, end + 1);
  let arr: unknown;
  try {
    arr = JSON.parse(s);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: MemoryCandidate[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const c = (it as { content?: unknown }).content;
    if (typeof c !== "string") continue;
    const content = c.trim().slice(0, 200);
    if (!content) continue;
    let imp = Number((it as { importance?: unknown }).importance);
    if (!Number.isFinite(imp)) imp = 3;
    imp = Math.max(1, Math.min(5, Math.round(imp)));
    out.push({ content, importance: imp });
    if (out.length >= 12) break; // 한 번에 너무 많이 만들지 않기
  }
  return out;
}

/** 추출 1회. 입력은 토큰 한도 위해 잘라서 전달. 실패 시 throw(호출부가 워터마크 보류). */
export async function extractMemories(
  conn: LlmConfig,
  content: string,
): Promise<MemoryCandidate[]> {
  const raw = await completeChat(conn, [
    { role: "system", content: EXTRACT_SYSTEM },
    { role: "user", content: content.slice(0, 6000) },
  ]);
  return parseMemoryCandidates(raw);
}
