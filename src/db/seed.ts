import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// 멱등 시드: settings(id=1) 단일 행 + 페르소나 theo/nora.
// 이미 있으면 건드리지 않는다(onConflictDoNothing).
async function main() {
  const pool = new Pool({ connectionString: process.env.DB_URL });
  const db = drizzle(pool, { schema });
  console.log("[seed] 시작");

  await db
    .insert(schema.settings)
    .values({ id: 1, activePersona: "nora" })
    .onConflictDoNothing();

  await db
    .insert(schema.personas)
    .values([
      { id: "theo", displayName: "테오" },
      { id: "nora", displayName: "노라" },
    ])
    .onConflictDoNothing();

  console.log("[seed] 완료");
  await pool.end();
}

main().catch((err) => {
  console.error("[seed] 실패:", err);
  process.exit(1);
});
