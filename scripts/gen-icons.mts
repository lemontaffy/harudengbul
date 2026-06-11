// 앱 아이콘 생성기 — 온브랜드 "등불(불빛)" 마크를 sharp 로 PNG 렌더.
//   출력: public/icons/{icon-192,icon-512,maskable-512}.png, src/app/{icon,apple-icon}.png
//   디자인 교체 시 이 파일의 SVG만 수정 후 재실행: npx tsx scripts/gen-icons.mts
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const BG = "#191B25";
const ACCENT = "#E8A86B";

// flameScale: 1 = 꽉 차게, 0.72 = maskable 안전영역
function svg(flameScale: number, withBg: boolean): string {
  const cx = 256;
  const cy = 268;
  const s = flameScale;
  // 중심 기준 스케일 변환
  const t = `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${withBg ? `<rect width="512" height="512" rx="0" fill="${BG}"/>` : ""}
  <g transform="${t}">
    <circle cx="${cx}" cy="${cy + 20}" r="150" fill="${ACCENT}" opacity="0.14"/>
    <path d="M256 120
             C 206 210, 184 256, 184 300
             a 72 72 0 1 0 144 0
             C 328 256, 306 210, 256 120 Z"
          fill="${ACCENT}"/>
    <path d="M256 210
             C 232 250, 222 274, 222 300
             a 34 34 0 1 0 68 0
             C 290 274, 280 250, 256 210 Z"
          fill="#FFFFFF" opacity="0.85"/>
  </g>
</svg>`;
}

async function render(svgStr: string, size: number, out: string) {
  await fs.mkdir(path.dirname(out), { recursive: true });
  await sharp(Buffer.from(svgStr)).resize(size, size).png().toBuffer().then((b) => fs.writeFile(out, b));
  console.log("✓", out, `${size}x${size}`);
}

const root = process.cwd();
const normal = svg(1, true);
const maskable = svg(0.72, true); // 안전영역 내로 축소

await render(normal, 192, path.join(root, "public/icons/icon-192.png"));
await render(normal, 512, path.join(root, "public/icons/icon-512.png"));
await render(maskable, 512, path.join(root, "public/icons/maskable-512.png"));
await render(normal, 256, path.join(root, "src/app/icon.png")); // favicon (Next 규약)
await render(normal, 180, path.join(root, "src/app/apple-icon.png")); // apple-touch (Next 규약)

console.log("아이콘 생성 완료");
