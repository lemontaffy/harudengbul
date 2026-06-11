import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// `npm run db:migrate` 또는 compose의 migrate 원샷 서비스에서 실행.
async function main() {
  const pool = new Pool({ connectionString: process.env.DB_URL });
  const db = drizzle(pool);
  console.log("[migrate] 시작");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("[migrate] 완료");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] 실패:", err);
  process.exit(1);
});
