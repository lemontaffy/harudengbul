/// <reference lib="webworker" />
// 서비스워커 — Serwist 가 빌드 시 public/sw.js 로 컴파일한다.
// (tsconfig 에서 이 파일은 exclude — 전역 lib(dom) 오염 방지, 위 webworker 참조로 타입 확보)
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Serwist 가 빌드 타임에 주입하는 프리캐시 매니페스트
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
