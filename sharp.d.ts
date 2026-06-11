// sharp 0.35 의 package.json "exports" 에 types 조건이 없어 moduleResolution:"bundler"가
// 번들된 타입(lib/index.d.ts)을 찾지 못한다. 파일 경로로 직접 가리켜 타입만 제공한다.
// (타입 전용 — 런타임 해석은 Next/Node가 node_modules/sharp 로 정상 처리)
declare module "sharp" {
  const sharp: typeof import("./node_modules/sharp/lib/index.js");
  export = sharp;
}
