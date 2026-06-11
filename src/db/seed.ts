import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { sql } from "drizzle-orm";

// 멱등 시드:
//  1) app_config(id=1) 전역 OpenRouter 설정 행
//  2) 사용자가 0명이면 admin 부트스트랩 — env ADMIN_USERNAME + APP_PASSWORD_HASH
//     (DELTA의 backfill 1단계를 fresh-start 버전으로 대체)
async function main() {
  const pool = new Pool({ connectionString: process.env.DB_URL });
  const db = drizzle(pool, { schema });
  console.log("[seed] 시작");

  await db.insert(schema.appConfig).values({ id: 1 }).onConflictDoNothing();

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.users);

  if (n === 0) {
    const username = process.env.ADMIN_USERNAME?.trim() || "admin";
    const passwordHash = process.env.APP_PASSWORD_HASH?.trim();
    if (!passwordHash) {
      console.warn(
        "[seed] APP_PASSWORD_HASH 미설정 → admin 부트스트랩 건너뜀. " +
          "hash 생성 후 다시 실행하세요: npm run hash-password -- '비밀번호'",
      );
    } else {
      const [admin] = await db
        .insert(schema.users)
        .values({ username, passwordHash, role: "admin" })
        .returning();
      await db
        .insert(schema.settings)
        .values({ userId: admin.id, activePersona: "nora" })
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
