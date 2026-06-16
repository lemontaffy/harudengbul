// 앱 아이콘 생성기 — 원본 이미지(icon-source.png)에서 각 크기 PNG 렌더.
//   출력: public/icons/{icon-192,icon-512,maskable-512}.png, src/app/{icon,apple-icon}.png
//   원본 교체 시 icon-source.png 만 갈아끼우고 재실행: npx tsx scripts/gen-icons.mts
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const SRC = path.join(root, "icon-source.png");
const PUSH_SRC = path.join(root, "icon-push.png"); // 푸시 알림용 원본(등불). 선택.
const BG = "#191B25"; // 테마 배경(maskable 평탄화용)

async function ensureDir(p: string) {
  await fs.mkdir(path.dirname(p), { recursive: true });
}

// "any"/파비콘/apple — 원본 디자인(둥근 플레이트) 유지하며 리사이즈.
async function plain(size: number, out: string) {
  await ensureDir(out);
  await sharp(SRC).resize(size, size, { fit: "cover" }).png().toFile(out);
  console.log("✓", path.relative(root, out), `${size}x${size}`);
}

// maskable — OS 마스크(원/스쿼클)가 깔끔히 먹도록 풀블리드.
//   원본의 검은 모서리 여백을 ~9% 센터 줌으로 잘라내고 테마색으로 평탄화.
async function maskable(size: number, out: string) {
  await ensureDir(out);
  const zoom = Math.round(size / 0.9); // 약 10% 확대
  const off = Math.round((zoom - size) / 2);
  await sharp(SRC)
    .resize(zoom, zoom, { fit: "cover" })
    .extract({ left: off, top: off, width: size, height: size })
    .flatten({ background: BG })
    .png()
    .toFile(out);
  console.log("✓", path.relative(root, out), `${size}x${size} (maskable)`);
}

// 소스(icon-push.png)는 '투명 배경 + 등불' PNG라 알파가 곧 실루엣이다. 색상 키잉(밝기 임계) 대신
//   소스 알파를 직접 쓴다 — 등불이 밝아도 안 깨짐. trim 으로 투명 여백 제거해 등불이 꽉 차게.
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

// 푸시 알림 본문 아이콘(컬러) — 등불을 trim 후 그대로(투명 배경 유지).
async function pushIcon(size: number, out: string) {
  await ensureDir(out);
  await sharp(PUSH_SRC)
    .trim()
    .resize(size, size, { fit: "contain", background: TRANSPARENT })
    .png()
    .toFile(out);
  console.log("✓", path.relative(root, out), `${size}x${size} (push icon)`);
}

// 상태바 뱃지 — Android 는 알파만 보고 흰 실루엣으로 렌더. 소스 알파를 흰 캔버스에 입힌다.
async function badge(size: number, out: string) {
  await ensureDir(out);
  const inner = Math.round(size * 0.9);
  const pad = Math.floor((size - inner) / 2);
  // 소스 알파 채널 → inner 크기 → size 로 패딩한 단일채널 마스크.
  const mask = await sharp(PUSH_SRC)
    .trim()
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .extractChannel("alpha")
    .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, background: "#000000" })
    .raw()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } })
    .joinChannel(mask, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toFile(out);
  console.log("✓", path.relative(root, out), `${size}x${size} (status-bar badge)`);
}

await fs.access(SRC).catch(() => {
  throw new Error(`원본이 없습니다: ${SRC} (레포 루트에 icon-source.png 저장 후 재실행)`);
});

await plain(192, path.join(root, "public/icons/icon-192.png"));
await plain(512, path.join(root, "public/icons/icon-512.png"));
await maskable(512, path.join(root, "public/icons/maskable-512.png"));
await plain(256, path.join(root, "src/app/icon.png")); // 파비콘(Next 규약)
await plain(180, path.join(root, "src/app/apple-icon.png")); // apple-touch(Next 규약)

// 푸시 알림 아이콘 + 제목 옆 아이콘 — icon-push.png(등불) 에서 생성(흰 배경 키아웃→투명 컬러).
if (await fs.access(PUSH_SRC).then(() => true).catch(() => false)) {
  await pushIcon(192, path.join(root, "public/icons/icon-push.png")); // 알림 본문(컬러)
  await badge(96, path.join(root, "public/icons/badge.png")); // 상태바 뱃지(흰 실루엣)
  await pushIcon(64, path.join(root, "public/icon-title.png")); // "하루등불" 제목 옆(22px 표시, 3x)
}

console.log("아이콘 생성 완료");
