// 기존 평문 llm_api_key 를 일괄 암호화(멱등). 배포 후 1회 실행.
//   이미 암호화된(enc:v1:) 행은 건너뛴다 → 여러 번 돌려도 안전.
// 실행: DB_URL=... [APP_ENCRYPTION_KEY=...] npx tsx scripts/encrypt-keys.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, isNotNull } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { encryptSecret, isEncrypted } from "../src/lib/crypto";

async function main() {
  const pool = new Pool({ connectionString: process.env.DB_URL });
  const db = drizzle(pool, { schema });
  console.log("[encrypt-keys] 시작");

  const rows = await db
    .select({ userId: schema.settings.userId, key: schema.settings.llmApiKey })
    .from(schema.settings)
    .where(isNotNull(schema.settings.llmApiKey));

  let changed = 0;
  for (const r of rows) {
    if (!r.key || isEncrypted(r.key)) continue; // 이미 암호화/빈 값 — 통과
    await db
      .update(schema.settings)
      .set({ llmApiKey: encryptSecret(r.key) })
      .where(eq(schema.settings.userId, r.userId));
    changed++;
  }

  console.log(`[encrypt-keys] 완료 — ${changed}건 암호화 (전체 ${rows.length}건)`);
  await pool.end();
}

main().catch((err) => {
  console.error("[encrypt-keys] 실패:", err);
  process.exit(1);
});
