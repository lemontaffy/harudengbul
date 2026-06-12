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

// 원본(등불)은 알파가 없는 흰 배경 PNG라, 밝은 배경을 키아웃해 알파 마스크를 직접 만든다.
//   greyscale→threshold(밝음=255)→negate ⇒ 등불(어두움)=255, 배경=0.
async function keyAlphaMask(rgbResized: Buffer): Promise<Buffer> {
  return sharp(rgbResized).greyscale().threshold(242).negate().toBuffer();
}

// 푸시 알림 본문 아이콘(컬러) — 흰 배경을 투명으로 키아웃해 등불만 띄운다.
async function pushIcon(size: number, out: string) {
  await ensureDir(out);
  const colour = await sharp(PUSH_SRC)
    .resize(size, size, { fit: "contain", background: "#ffffff" })
    .removeAlpha()
    .toBuffer();
  const mask = await keyAlphaMask(colour);
  await sharp(colour).joinChannel(mask).png().toFile(out);
  console.log("✓", path.relative(root, out), `${size}x${size} (push icon)`);
}

// 상태바 뱃지 — Android 는 알파만 보고 흰 실루엣으로 렌더한다.
//   등불을 패딩 둔 흰 캔버스 중앙에 올려 키아웃 → 그 실루엣 알파를 흰색에 입힌다.
async function badge(size: number, out: string) {
  await ensureDir(out);
  const inner = Math.round(size * 0.8); // 약 10% 패딩
  const lantern = await sharp(PUSH_SRC)
    .resize(inner, inner, { fit: "contain", background: "#ffffff" })
    .removeAlpha()
    .png()
    .toBuffer();
  const onWhite = await sharp({
    create: { width: size, height: size, channels: 3, background: "#ffffff" },
  })
    .composite([{ input: lantern, gravity: "center" }])
    .png()
    .toBuffer(); // size×size RGB(PNG), 흰 배경 + 중앙 등불
  const mask = await keyAlphaMask(onWhite); // 등불=255, 흰 배경/패딩=0
  await sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } })
    .joinChannel(mask) // 흰색 + 등불 실루엣 알파
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

// 푸시 알림 아이콘 — icon-push.png 가 있으면 본문 아이콘(컬러)+상태바 뱃지(흰 실루엣) 생성.
if (await fs.access(PUSH_SRC).then(() => true).catch(() => false)) {
  await pushIcon(192, path.join(root, "public/icons/icon-push.png"));
  await badge(96, path.join(root, "public/icons/badge.png"));
}

console.log("아이콘 생성 완료");
