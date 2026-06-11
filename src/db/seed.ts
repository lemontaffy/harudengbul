import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { sql } from "drizzle-orm";

// 멱등 시드: 사용자가 0명이면 admin 부트스트랩.
//  - env ADMIN_USERNAME + APP_PASSWORD_HASH 로 관리자 1명 생성
//  - env LLM_API_KEY / LLM_BASE_URL / LLM_MODEL 있으면 "관리자 본인" 연결만 시드(전역 아님).
//    멤버는 각자 /settings 에서 자기 연결을 넣는다.
async function main() {
  const pool = new Pool({ connectionString: process.env.DB_URL });
  const db = drizzle(pool, { schema });
  console.log("[seed] 시작");

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.users);

  if (n === 0) {
    const username = process.env.ADMIN_USERNAME?.trim() || "admin";
    const passwordHash = process.env.APP_PASSWORD_HASH?.trim();
    if (!passwordHash) {
      console.warn(
        "[seed] APP_PASSWORD_HASH 미설정 → admin 부트스트랩 건너뜀. " +
          "hash 생성 후 다시 실행: npm run hash-password -- '비밀번호'",
      );
    } else {
      const [admin] = await db
        .insert(schema.users)
        .values({ username, passwordHash, role: "admin" })
        .returning();
      await db
        .insert(schema.settings)
        .values({
          userId: admin.id,
          activePersona: "nora",
          llmApiKey: process.env.LLM_API_KEY?.trim() || null,
          llmBaseUrl: process.env.LLM_BASE_URL?.trim() || null,
          llmModel: process.env.LLM_MODEL?.trim() || null,
        })
        .onConflictDoNothing();
      await db
        .insert(schema.personas)
        .values([
          { userId: admin.id, id: "theo", displayName: "테오" },
          { userId: admin.id, id: "nora", displayName: "노라" },
        ])
        .onConflictDoNothing();
      console.log(`[seed] admin 생성: ${username} (id=${admin.id})`);
    }
  } else {
    console.log(`[seed] 사용자 ${n}명 존재 — admin 부트스트랩 생략`);
  }

  console.log("[seed] 완료");
  await pool.end();
}

main().catch((err) => {
  console.error("[seed] 실패:", err);
  process.exit(1);
});
