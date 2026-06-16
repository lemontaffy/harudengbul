import type { Metadata, Viewport } from "next";
import "./globals.css";
import TabBar from "@/components/TabBar";
import CustomCss from "@/components/CustomCss";
import ResumeHandler from "@/components/ResumeHandler";
import { DialogProvider } from "@/components/ui/Dialog";
import { getAppearance, sanitizeCss } from "@/lib/theme";

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme, customCss, appBgPath } = await getAppearance();
  return (
    <html lang="ko" data-theme={theme}>
      <body>
        {/* 앱 배경 이미지(선택) — 테마 배경 위에 고정 레이어로 깔되, 콘텐츠 가독성 위해 살짝 어둡게. */}
        {appBgPath && (
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.35),rgba(0,0,0,0.35)), url("${appBgPath}")` }}
          />
        )}
        <DialogProvider>
          {children}
          <TabBar />
        </DialogProvider>
        <ResumeHandler />
        <CustomCss css={customCss ? sanitizeCss(customCss) : null} />
      </body>
    </html>
  );
}
