import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "하루등불",
  description: "데스크탑·모바일에서 동기화되는 1인용 AI 비서/상담 앱",
};

export const viewport: Viewport = {
  themeColor: "#191B25",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
