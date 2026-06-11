import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// 개발 중 HMR로 Pool이 중복 생성되는 것을 막기 위해 globalThis에 캐시한다.
const globalForDb = globalThis as unknown as { __pool?: Pool };

const pool =
  globalForDb.__pool ?? new Pool({ connectionString: process.env.DB_URL });

if (process.env.NODE_ENV !== "production") globalForDb.__pool = pool;

export const db = drizzle(pool, { schema });
