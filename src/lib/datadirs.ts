import { promises as fs } from "node:fs";
import path from "node:path";
import { AVATARS_DIR } from "@/lib/avatars";
import { UPLOADS_DIR } from "@/lib/uploads";
import { DIARY_PHOTOS_DIR } from "@/lib/diaryPhotos";
import { SPRITES_DIR } from "@/lib/petSprites";
import { permGuidance, isPermError } from "@/lib/permcheck";

const DATA_DIRS: { name: string; dir: string }[] = [
  { name: "AVATARS_DIR", dir: AVATARS_DIR },
  { name: "UPLOADS_DIR", dir: UPLOADS_DIR },
  { name: "DIARY_PHOTOS_DIR", dir: DIARY_PHOTOS_DIR },
  { name: "SPRITES_DIR", dir: SPRITES_DIR },
];

/**
 * 기동 시 1회 — 모든 데이터 디렉터리에 임시 파일 쓰기 시도. 실패 시 정확한 uid 포함 안내 출력.
 * 업로드가 런타임에 EACCES 로 깨지기 전에 운영자가 바로잡게 한다.
 */
export async function checkDataDirsWritable(): Promise<void> {
  for (const { name, dir } of DATA_DIRS) {
    try {
      await fs.mkdir(dir, { recursive: true });
      const probe = path.join(dir, `.write-test-${process.pid}`);
      await fs.writeFile(probe, "ok");
      await fs.rm(probe, { force: true });
    } catch (err) {
      if (isPermError(err)) {
        console.error(`[data] ${name} 쓰기 불가 — ${permGuidance(dir)}`);
      } else {
        console.error(`[data] ${name} 점검 실패: ${(err as Error)?.message}`);
      }
    }
  }
}
