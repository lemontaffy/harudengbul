// 앱 아이콘 생성기 — 원본 이미지(icon-source.png)에서 각 크기 PNG 렌더.
//   출력: public/icons/{icon-192,icon-512,maskable-512}.png, src/app/{icon,apple-icon}.png
//   원본 교체 시 icon-source.png 만 갈아끼우고 재실행: npx tsx scripts/gen-icons.mts
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const SRC = path.join(root, "icon-source.png");
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

await fs.access(SRC).catch(() => {
  throw new Error(`원본이 없습니다: ${SRC} (레포 루트에 icon-source.png 저장 후 재실행)`);
});

await plain(192, path.join(root, "public/icons/icon-192.png"));
await plain(512, path.join(root, "public/icons/icon-512.png"));
await maskable(512, path.join(root, "public/icons/maskable-512.png"));
await plain(256, path.join(root, "src/app/icon.png")); // 파비콘(Next 규약)
await plain(180, path.join(root, "src/app/apple-icon.png")); // apple-touch(Next 규약)

console.log("아이콘 생성 완료");
