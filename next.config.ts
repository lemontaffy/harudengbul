import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // docker 배포: .next/standalone 산출 → 작은 런타임 이미지
  output: "standalone",
};

export default nextConfig;
