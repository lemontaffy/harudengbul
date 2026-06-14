// 펫 추억 — 펫이 편지로 사용자와 쌓는 'pet' 스코프 기억의 회수·저장.
//   격리 원칙: 펫은 scope='pet' AND pet_id=자기 것만 본다. 사용자 사적 기억(건강·ADHD 등)·
//   메타·페르소나(legacy/counselor/secretary) 기억은 절대 회수하지 않는다.
import * as memoriesRepo from "@/db/repo/memories";
import { getEmbedConfig } from "@/lib/config";
import { embed } from "@/lib/embeddings";

/** 그 펫(petId)이 사용자와 쌓은 추억만 회수. 임베딩 가능하면 의미검색, 아니면 importance 폴백. */
export async function recallPetMemories(
  userId: number,
  petId: number,
  query?: string,
  limit = 12,
): Promise<string[]> {
  const cond = memoriesRepo.petScope(petId);
  const q = query?.trim();
  if (q) {
    const cfg = await getEmbedConfig(userId);
    if (cfg.configured) {
      const vec = await embed(cfg, q);
      if (vec) {
        const hits = await memoriesRepo.searchByEmbedding(userId, vec, limit, cond);
        if (hits.length) return hits.map((m) => m.content);
      }
    }
  }
  const rows = await memoriesRepo.getForPrompt(userId, limit, cond);
  return rows.map((m) => m.content);
}

/**
 * 펫 추억 저장 — scope='pet', pet_id 기록. 임베딩 best-effort(의미회수용).
 * ※ 민감/사적 정보 제외는 '생성(추출) 단계'가 보장한다(여기선 저장만). 중복은 무시.
 */
export async function savePetMemory(
  userId: number,
  petId: number,
  content: string,
  importance = 3,
): Promise<void> {
  const c = content.trim();
  if (!c) return;
  if (await memoriesRepo.existsContent(userId, c)) return;
  const row = await memoriesRepo.add(userId, c, "pet_letter", importance, { scope: "pet", petId });
  try {
    const cfg = await getEmbedConfig(userId);
    if (cfg.configured) {
      const vec = await embed(cfg, c);
      if (vec) await memoriesRepo.setEmbedding(userId, row.id, vec);
    }
  } catch {
    /* 임베딩 실패해도 폴백 회수 있음 — 무시 */
  }
}
