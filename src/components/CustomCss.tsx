"use client";

import { usePathname } from "next/navigation";

// 본인 세션에만 커스텀 CSS 주입. 설정 페이지에서는 주입하지 않는다
// (깨진 CSS 를 저장해도 설정에서 복구할 수 있도록).
export default function CustomCss({ css }: { css: string | null }) {
  const pathname = usePathname();
  if (!css) return null;
  if (pathname.startsWith("/settings")) return null;
  return <style>{css}</style>;
}
