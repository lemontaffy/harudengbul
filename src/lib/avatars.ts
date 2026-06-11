import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// 아바타 파일 저장소. docker 에선 ./data/avatars 볼륨을 /data/avatars 로 마운트.
// 로컬 개발에선 env 없이 프로젝트의 ./data/avatars 사용.
export const AVATARS_DIR =
  process.env.AVATARS_DIR?.trim() || path.join(process.cwd(), "data", "avatars");

// MIME → 확장자 (허용 포맷만)
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const MAX_BYTES = 2 * 1024 * 1024; // 2MB

export class AvatarError extends Error {}

/**
 * 업로드 이미지를 검증·저장하고 public 경로(`/api/avatars/{파일명}`)를 반환.
 * 파일명에 랜덤 토큰을 포함해 열거를 어렵게 한다.
 */
export async function saveAvatar(personaId: number, file: File): Promise<string> {
  const ext = MIME_EXT[file.type];
  if (!ext) {
    throw new AvatarError("PNG/JPEG/WEBP 이미지만 업로드할 수 있어요.");
  }
  if (file.size > MAX_BYTES) {
    throw new AvatarError("이미지는 2MB 이하만 가능해요.");
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    throw new AvatarError("이미지는 2MB 이하만 가능해요.");
  }

  await fs.mkdir(AVATARS_DIR, { recursive: true });
  const filename = `${personaId}-${randomUUID()}.${ext}`;
  await fs.writeFile(path.join(AVATARS_DIR, filename), buf);
  return `/api/avatars/${filename}`;
}

const EXT_CONTENT_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** 파일명으로 아바타 읽기. 경로 탈출 방지를 위해 basename 으로 정규화. */
export async function readAvatar(
  name: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const safe = path.basename(name); // ../ 등 제거
  if (safe !== name || !safe) return null;
  const ext = path.extname(safe).slice(1).toLowerCase();
  const contentType = EXT_CONTENT_TYPE[ext];
  if (!contentType) return null;
  try {
    const data = await fs.readFile(path.join(AVATARS_DIR, safe));
    return { data, contentType };
  } catch {
    return null;
  }
}
