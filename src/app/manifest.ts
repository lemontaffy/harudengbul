import type { MetadataRoute } from "next";

// PWA 매니페스트 — Next 가 /manifest.webmanifest 로 서빙하고 <link rel="manifest"> 자동 주입.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "하루등불",
    short_name: "하루등불",
    description: "AI 비서·상담 동반자 — 채팅, 일기, 일정, 가계부.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#191B25",
    theme_color: "#191B25",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
