import type { Metadata, Viewport } from "next";
import "./globals.css";
import TabBar from "@/components/TabBar";

export const metadata: Metadata = {
  applicationName: "하루등불",
  title: "하루등불",
  description: "데스크탑·모바일에서 동기화되는 1인용 AI 비서/상담 앱",
  // manifest 와 아이콘(app/icon.png·app/apple-icon.png)은 Next 가 자동 주입.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "하루등불",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#191B25",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        {children}
        <TabBar />
      </body>
    </html>
  );
}
