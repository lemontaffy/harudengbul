import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

// 일기 사진 저장소. docker 에선 ./data/diary-photos 볼륨을 마운트.
export const DIARY_PHOTOS_DIR =
  process.env.DIARY_PHOTOS_DIR?.trim() ||
  path.join(process.cwd(), "data", "diary-photos");

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_DIM = 1280; // 긴 변 최대(아바타와 달리 원본 비율 유지)

export class DiaryPhotoError extends Error {}

// 매직바이트 화이트리스트(PNG/JPEG/WebP만) — 클라이언트 MIME 불신, 저장형 XSS 방지.
function sniffAllowed(buf: Buffer): boolean {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  )
    return true;
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return true;
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return true;
  return false;
}

/**
 * 일기 사진을 검증·재인코딩(webp, 비율 유지, 긴 변 1280)해 저장하고 public URL 반환.
 * 메타데이터 제거 + 파일명 랜덤(uuid) + per-user 서브디렉터리(traversal 차단).
 */
export async function saveDiaryPhoto(userId: number, file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new DiaryPhotoError("사진은 8MB 이하만 가능해요.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength < 1 || buf.byteLength > MAX_BYTES) {
    throw new DiaryPhotoError("사진 크기가 올바르지 않아요 (최대 8MB).");
  }
  if (!sniffAllowed(buf)) {
    throw new DiaryPhotoError("PNG/JPEG/WEBP 이미지만 올릴 수 있어요.");
  }

  let out: Buffer;
  try {
    out = await sharp(buf)
      .rotate() // EXIF 방향 보정 후 메타데이터 제거
      .resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new DiaryPhotoError("사진을 처리할 수 없어요. 다른 파일을 시도해 주세요.");
  }

  const dir = path.join(DIARY_PHOTOS_DIR, String(userId));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.webp`;
  await fs.writeFile(path.join(dir, filename), out);
  return `/api/diary-photos/${userId}/${filename}`;
}

/** 서빙용 — 호출부에서 DB의 photo_path 와 대조한 뒤에만 사용. traversal 재확인. */
export async function readDiaryPhotoBySegments(
  segments: string[],
): Promise<Buffer | null> {
  if (segments.some((s) => !s || s === "." || s === "..")) return null;
  const target = path.resolve(DIARY_PHOTOS_DIR, ...segments);
  const root = path.resolve(DIARY_PHOTOS_DIR);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  try {
    return await fs.readFile(target);
  } catch {
    return null;
  }
}

const PHOTO_URL_PREFIX = "/api/diary-photos/";

/**
 * photo_path(public URL)를 비전 모델용 data:URL(webp base64)로 읽는다.
 * 저장 파일은 항상 webp. 못 읽으면 null(첨부 생략 → 안전 폴백).
 */
export async function readDiaryPhotoDataUrl(
  photoPath: string,
): Promise<string | null> {
  if (!photoPath.startsWith(PHOTO_URL_PREFIX)) return null;
  const segments = photoPath.slice(PHOTO_URL_PREFIX.length).split("/");
  const buf = await readDiaryPhotoBySegments(segments);
  if (!buf) return null;
  return `data:image/webp;base64,${buf.toString("base64")}`;
}
