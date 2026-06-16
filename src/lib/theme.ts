import { getCurrentUser } from "@/lib/currentUser";
import * as settingsRepo from "@/db/repo/settings";

export const THEMES = ["lantern", "dawn", "paper"] as const;
export type Theme = (typeof THEMES)[number];
export const isTheme = (v: unknown): v is Theme =>
  typeof v === "string" && (THEMES as readonly string[]).includes(v);

export interface Appearance {
  theme: Theme;
  customCss: string | null;
  appBgPath: string | null;
}

// 현재 세션 사용자의 화면 설정. 비로그인/미설정은 기본 lantern.
export async function getAppearance(): Promise<Appearance> {
  const user = await getCurrentUser();
  if (!user) return { theme: "lantern", customCss: null, appBgPath: null };
  const s = await settingsRepo.getByUser(user.id);
  return {
    theme: isTheme(s?.theme) ? (s!.theme as Theme) : "lantern",
    customCss: s?.customCss ?? null,
    appBgPath: s?.appBgPath ?? null,
  };
}

// <style> 주입 안전화 — </style>·<style> 브레이크아웃 차단.
// (CSS 는 JS 를 실행하지 않으므로 본인 세션 한정 self-스타일링 리스크만 남는다)
export function sanitizeCss(css: string): string {
  return css.replace(/<\/?\s*style/gi, "");
}
