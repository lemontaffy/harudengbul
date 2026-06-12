import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

// 채팅 첨부 사진 저장소(아바타·일기와 분리). docker 에선 ./data/uploads 볼륨 마운트.
export const UPLOADS_DIR =
  process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "data", "uploads");

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_DIM = 1568; // 긴 변 최대(비전 모델 권장 해상도)

export class UploadError extends Error {}

// 매직바이트 화이트리스트(PNG/JPEG/WebP만). 클라이언트 MIME 불신.
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
 * 채팅 첨부 이미지를 검증·재인코딩해 저장하고 public URL 반환.
 *  - 매직바이트 화이트리스트(PNG/JPEG/WebP), 10MB 이하
 *  - sharp .rotate() 로 EXIF 방향 적용 후 jpeg 재인코딩 → EXIF(특히 GPS) 전부 제거(메타 미보존)
 *  - 긴 변 1568px 다운스케일, per-user 서브디렉터리 + uuid 파일명(traversal 차단)
 */
export async function saveUpload(userId: number, file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new UploadError("사진은 10MB 이하만 가능해요.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength < 1 || buf.byteLength > MAX_BYTES) {
    throw new UploadError("사진 크기가 올바르지 않아요 (최대 10MB).");
  }
  if (!sniffAllowed(buf)) {
    throw new UploadError("PNG/JPEG/WEBP 이미지만 올릴 수 있어요.");
  }

  let out: Buffer;
  try {
    out = await sharp(buf)
      .rotate() // EXIF 방향 적용 — 이후 메타 미보존(withMetadata 안 함)이라 GPS 포함 EXIF 제거
      .resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    throw new UploadError("사진을 처리할 수 없어요. 다른 파일을 시도해 주세요.");
  }

  const dir = path.join(UPLOADS_DIR, String(userId));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.jpg`;
  await fs.writeFile(path.join(dir, filename), out);
  return `/api/uploads/${userId}/${filename}`;
}

/** 서빙용 — 호출부에서 DB의 attachment_path 와 대조한 뒤에만 사용. traversal 재확인. */
export async function readUploadBySegments(
  segments: string[],
): Promise<Buffer | null> {
  if (segments.some((s) => !s || s === "." || s === "..")) return null;
  const target = path.resolve(UPLOADS_DIR, ...segments);
  const root = path.resolve(UPLOADS_DIR);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  try {
    return await fs.readFile(target);
  } catch {
    return null;
  }
}

const URL_PREFIX = "/api/uploads/";

/** 첨부 사진을 비전 모델용 data:URL(jpeg base64)로 읽는다. 못 읽으면 null. */
export async function readUploadDataUrl(url: string): Promise<string | null> {
  if (!url.startsWith(URL_PREFIX)) return null;
  const buf = await readUploadBySegments(url.slice(URL_PREFIX.length).split("/"));
  if (!buf) return null;
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}
