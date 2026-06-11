import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  // docker 배포: .next/standalone 산출 → 작은 런타임 이미지
  output: "standalone",
};

// PWA — Serwist 가 src/app/sw.ts 를 public/sw.js 로 빌드하고 자동 등록(register 기본 true).
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // 개발 중엔 SW 비활성(캐시로 인한 혼선 방지). 프로덕션 빌드에서만 생성.
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
