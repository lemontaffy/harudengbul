import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { permGuidance, isPermError } from "@/lib/permcheck";

// 아바타 저장소. docker 에선 ./data/avatars 볼륨을 /data/avatars 로 마운트.
// 로컬 개발에선 env 없이 프로젝트의 ./data/avatars 사용.
export const AVATARS_DIR =
  process.env.AVATARS_DIR?.trim() || path.join(process.cwd(), "data", "avatars");

const MIN_BYTES = 1; // 빈 파일 거부
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const OUT_SIZE = 256;

export class AvatarError extends Error {}

// 매직 바이트 화이트리스트(클라이언트 MIME·확장자 불신).
//   PNG / JPEG / WebP(RIFF....WEBP) 만 허용 → SVG·기타 전부 거부(저장형 XSS 방지).
function sniffAllowed(buf: Buffer): boolean {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
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
    return true;
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return true;
  // WebP: "RIFF"...."WEBP"
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return true;
  return false;
}

/**
 * 업로드 이미지를 검증·재인코딩해 저장하고 public URL(`/api/avatars/{userId}/{uuid}.webp`)을 반환.
 *  - 매직바이트 화이트리스트(PNG/JPEG/WebP) → SVG 등 거부
 *  - sharp 로 256px webp 재인코딩 → NAI 등 원본 메타데이터 제거 + 페이로드 세탁 + 크기 축소
 *  - 파일명 랜덤(uuid), per-user 서브디렉터리 (원본 파일명 미사용 → path traversal 차단)
 * 원본을 그대로 저장하는 경로는 존재하지 않는다.
 */
export async function saveAvatar(userId: number, file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new AvatarError("이미지는 5MB 이하만 가능해요.");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength < MIN_BYTES || buf.byteLength > MAX_BYTES) {
    throw new AvatarError("이미지 크기가 올바르지 않아요 (최대 5MB).");
  }
  if (!sniffAllowed(buf)) {
    throw new AvatarError("PNG/JPEG/WEBP 이미지만 업로드할 수 있어요.");
  }

  let out: Buffer;
  try {
    out = await sharp(buf)
      .rotate() // EXIF 방향 보정 후 메타데이터 제거됨
      .resize(OUT_SIZE, OUT_SIZE, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new AvatarError("이미지를 처리할 수 없어요. 다른 파일을 시도해 주세요.");
  }

  const dir = path.join(AVATARS_DIR, String(userId));
  const filename = `${randomUUID()}.webp`;
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), out);
  } catch (err) {
    if (isPermError(err)) {
      console.error(`[avatar] 저장 실패 — ${permGuidance(AVATARS_DIR)}`);
      throw new AvatarError(permGuidance(AVATARS_DIR));
    }
    throw new AvatarError("이미지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  return `/api/avatars/${userId}/${filename}`;
}

/**
 * 앱 배경 이미지 저장 — 아바타와 달리 정사각 크롭하지 않고 종횡비 보존(최대 1280px, webp).
 *   같은 저장소·서빙(/api/avatars/{userId}/{uuid}.webp) 재사용. 화이트리스트는 settings.app_bg_path.
 */
export async function saveAppBg(userId: number, file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new AvatarError("이미지는 5MB 이하만 가능해요.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength < MIN_BYTES || buf.byteLength > MAX_BYTES)
    throw new AvatarError("이미지 크기가 올바르지 않아요 (최대 5MB).");
  if (!sniffAllowed(buf)) throw new AvatarError("PNG/JPEG/WEBP 이미지만 업로드할 수 있어요.");

  let out: Buffer;
  try {
    out = await sharp(buf)
      .rotate()
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true }) // 종횡비 보존, 안 키움
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new AvatarError("이미지를 처리할 수 없어요. 다른 파일을 시도해 주세요.");
  }
  const dir = path.join(AVATARS_DIR, String(userId));
  const filename = `${randomUUID()}.webp`;
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), out);
  } catch (err) {
    if (isPermError(err)) {
      console.error(`[app-bg] 저장 실패 — ${permGuidance(AVATARS_DIR)}`);
      throw new AvatarError(permGuidance(AVATARS_DIR));
    }
    throw new AvatarError("이미지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  return `/api/avatars/${userId}/${filename}`;
}

/**
 * 서빙용 — DB가 화이트리스트. 요청 경로 세그먼트를 받아 디스크에서 읽되,
 * 호출부에서 먼저 DB의 avatar_path 와 대조한 뒤에만 사용해야 한다.
 * 추가 가드: 최종 경로가 AVATARS_DIR 하위인지 재확인.
 */
export async function readAvatarBySegments(
  segments: string[],
): Promise<Buffer | null> {
  if (segments.some((s) => !s || s === "." || s === "..")) return null;
  const target = path.resolve(AVATARS_DIR, ...segments);
  const root = path.resolve(AVATARS_DIR);
  if (target !== root && !target.startsWith(root + path.sep)) return null; // traversal 차단
  try {
    return await fs.readFile(target);
  } catch {
    return null;
  }
}
