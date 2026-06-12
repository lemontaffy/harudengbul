import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { eq } from "drizzle-orm";
import { encryptSecret } from "../lib/crypto";

// 멱등 시드: ADMIN_USERNAME 계정이 "없을 때만" admin 부트스트랩.
//  - env APP_PASSWORD_HASH 값을 재해싱 없이 그대로 복사해 생성.
//  - 이미 존재하면 절대 건드리지 않는다(update 금지) → 컨테이너 재시작/ env 변경에 안전.
//    (env에서 APP_PASSWORD_HASH 를 지워도, admin 이미 있으면 정상 동작)
//  - env LLM_* 있으면 "관리자 본인" 연결만 시드(전역 아님). 멤버는 각자 /settings 입력.
async function main() {
  const pool = new Pool({ connectionString: process.env.DB_URL });
  const db = drizzle(pool, { schema });
  console.log("[seed] 시작");

  const username = process.env.ADMIN_USERNAME?.trim() || "admin";
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.username, username),
  });

  if (existing) {
    console.log(`[seed] admin '${username}' 이미 존재 — 무수정 통과`);
  } else {
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
          llmApiKey: encryptSecret(process.env.LLM_API_KEY?.trim() || null),
          llmBaseUrl: process.env.LLM_BASE_URL?.trim() || null,
          llmModel: process.env.LLM_MODEL?.trim() || null,
        })
        .onConflictDoNothing();
      // 기본 캐릭터 2인(노라=상담가, 테오=비서) + settings 트리거 기본값(상담가/비서/상담가).
      const [nora] = await db
        .insert(schema.personas)
        .values({
          userId: admin.id,
          name: "노라",
          roles: ["counselor"],
          traits:
            "따뜻하지만 물러서지 않는다. 좋은 질문을 하나씩 던진다. 호들갑은 금지.",
        })
        .returning();
      const [theo] = await db
        .insert(schema.personas)
        .values({
          userId: admin.id,
          name: "테오",
          roles: ["secretary"],
          traits:
            "차분하고 군더더기 없다. 가끔 건조한 농담. 걱정은 짧고 정확하게 표현한다.",
        })
        .returning();
      await db
        .update(schema.settings)
        .set({
          activePersonaId: nora.id,
          diaryReplyPersonaId: nora.id,
          morningPersonaId: theo.id,
          eveningPersonaId: nora.id,
        })
        .where(eq(schema.settings.userId, admin.id));
      console.log(`[seed] admin 생성: ${username} (id=${admin.id})`);
    }
  }

  console.log("[seed] 완료");
  await pool.end();
}

main().catch((err) => {
  console.error("[seed] 실패:", err);
  process.exit(1);
});
