import { spawn } from "node:child_process";
import { createGzip } from "node:zlib";
import { createWriteStream, promises as fs } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";

// pg_dump 백업. worker(backupJob)에서만 사용. pg_dump 는 worker 이미지에 postgresql16-client 로 포함.
export const BACKUP_DIR = process.env.BACKUP_DIR?.trim() || "/data/backups";
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 7);
const PREFIX = "haru-";
const SUFFIX = ".sql.gz";

/** 로테이션 대상(삭제할 파일명) — 이름(날짜) 오름차순 정렬 후 keep 초과한 오래된 것들. 순수 함수. */
export function staleBackups(names: string[], keep = KEEP): string[] {
  const backups = names
    .filter((n) => n.startsWith(PREFIX) && n.endsWith(SUFFIX))
    .sort();
  return backups.length > keep ? backups.slice(0, backups.length - keep) : [];
}

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
}

/**
 * pg_dump → gzip → /data/backups/haru-YYYY-MM-DD.sql.gz. 성공 후 7일 초과분 정리.
 * 부분 파일(.tmp)로 쓰고 성공 시 rename — 중단돼도 깨진 백업이 남지 않게.
 */
export async function runBackup(): Promise<{ file: string; bytes: number; pruned: number }> {
  const dbUrl = process.env.DB_URL;
  if (!dbUrl) throw new Error("DB_URL 없음");

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const name = `${PREFIX}${todayKst()}${SUFFIX}`;
  const finalPath = path.join(BACKUP_DIR, name);
  const tmpPath = `${finalPath}.tmp`;

  const dump = spawn(
    "pg_dump",
    ["--no-owner", "--no-privileges", dbUrl],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  dump.stderr.on("data", (d) => (stderr += d.toString()));
  const exited = new Promise<number>((resolve) => dump.on("close", resolve));

  try {
    await pipeline(dump.stdout, createGzip(), createWriteStream(tmpPath));
    const code = await exited;
    if (code !== 0) throw new Error(`pg_dump exit ${code}: ${stderr.slice(0, 300)}`);
  } catch (err) {
    await fs.rm(tmpPath, { force: true });
    throw err;
  }
  await fs.rename(tmpPath, finalPath);

  // 로테이션
  const names = await fs.readdir(BACKUP_DIR);
  const stale = staleBackups(names);
  for (const f of stale) await fs.rm(path.join(BACKUP_DIR, f), { force: true });

  const stat = await fs.stat(finalPath);
  return { file: name, bytes: stat.size, pruned: stale.length };
}
