import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

// 펫 스프라이트/배경 저장소. docker: ./data/sprites → /data/sprites.
export const SPRITES_DIR =
  process.env.SPRITES_DIR?.trim() || path.join(process.cwd(), "data", "sprites");

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const LONG_EDGE = 512; // 초과 시 안내만(차단 안 함)

export class SpriteError extends Error {}

export type SpriteExt = "gif" | "webp" | "png" | "jpeg";

// 매직 바이트(클라이언트 MIME·확장자 불신). 애니메이션 보존을 위해 재인코딩 안 함 → SVG 등 차단 필수.
//   스프라이트: GIF/WebP/PNG. 배경: + JPEG.
export function sniffSprite(buf: Buffer, allowJpeg = false): SpriteExt | null {
  // GIF: "GIF87a" | "GIF89a"
  if (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  )
    return "gif";
  // WebP: "RIFF"...."WEBP"
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  // PNG
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return "png";
  // JPEG (배경만)
  if (allowJpeg && buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "jpeg";
  return null;
}

const CT: Record<SpriteExt, string> = {
  gif: "image/gif",
  webp: "image/webp",
  png: "image/png",
  jpeg: "image/jpeg",
};

/**
 * 업로드 검증 후 **원본 그대로** 저장(재인코딩 금지 — GIF 프레임 보존). public URL 반환.
 *  - 매직바이트 화이트리스트, 5MB 제한, per-user dir, 랜덤 파일명(traversal 차단).
 *  - 긴 변 512px 초과면 차단하지 않고 warning 문자열만 반환(천천히 채우는 구조 존중).
 */
export async function saveSprite(
  userId: number,
  file: File,
  opts: { allowJpeg?: boolean } = {},
): Promise<{ path: string; warning: string | null }> {
  if (file.size > MAX_BYTES) throw new SpriteError("이미지는 5MB 이하만 가능해요.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength < 1 || buf.byteLength > MAX_BYTES)
    throw new SpriteError("이미지 크기가 올바르지 않아요 (최대 5MB).");
  const ext = sniffSprite(buf, opts.allowJpeg);
  if (!ext)
    throw new SpriteError(
      opts.allowJpeg
        ? "GIF/WEBP/PNG/JPEG 이미지만 업로드할 수 있어요."
        : "GIF/WEBP/PNG 이미지만 업로드할 수 있어요.",
    );

  // 크기는 읽기만(재인코딩 안 함 → 원본 보존).
  let warning: string | null = null;
  try {
    const meta = await sharp(buf, { animated: false }).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (Math.max(w, h) > LONG_EDGE) {
      warning = `긴 변이 ${Math.max(w, h)}px예요. ${LONG_EDGE}px 이하 권장(그대로 저장은 됩니다).`;
    }
  } catch {
    /* 크기 못 읽어도 저장은 진행 */
  }

  const dir = path.join(SPRITES_DIR, String(userId));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, filename), buf); // 원본 그대로
  return { path: `/api/pet-sprites/${userId}/${filename}`, warning };
}

export function contentTypeForPath(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase();
  if (ext === "gif") return CT.gif;
  if (ext === "webp") return CT.webp;
  if (ext === "png") return CT.png;
  if (ext === "jpg" || ext === "jpeg") return CT.jpeg;
  return "application/octet-stream";
}

/** 서빙 — DB 화이트리스트 대조 후에만 사용. traversal 재확인. */
export async function readSpriteBySegments(segments: string[]): Promise<Buffer | null> {
  if (segments.some((s) => !s || s === "." || s === "..")) return null;
  const target = path.resolve(SPRITES_DIR, ...segments);
  const root = path.resolve(SPRITES_DIR);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  try {
    return await fs.readFile(target);
  } catch {
    return null;
  }
}
