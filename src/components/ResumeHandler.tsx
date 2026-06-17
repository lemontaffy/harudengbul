"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// PWA 복귀(앱 전환·잠금 해제) 시 화면이 멈추거나 깨지는 문제 대응.
// 최상위에 1개만 마운트 — 오래 백그라운드였을 때만 소프트 재검증(router.refresh)해
// stale 상태-DOM 불일치를 정리한다(무거운 전체 리로드는 피함).
// bfcache 복귀(pageshow.persisted)는 화면을 그대로 살리는 게 정상이라 새로고침하지 않는다
// — 일상적인 앱 전환마다 무조건 refresh 되어 '초기화'처럼 보이던 문제의 주범이라 제거.
const STALE_MS = 300_000; // 5분 이상 백그라운드였을 때만 재검증(짧은 앱 전환은 스킵)

export default function ResumeHandler() {
  const router = useRouter();
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // 복귀(visible): 오래 백그라운드였으면 가볍게 재검증.
      if (hiddenAt && Date.now() - hiddenAt > STALE_MS) router.refresh();
      hiddenAt = 0;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
