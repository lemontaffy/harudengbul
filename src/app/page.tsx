import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { getOpenRouterConfig } from "@/lib/config";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

// M2: 인증된 홈(임시 랜딩). 채팅 홈은 M3에서 교체.
export default async function Home() {
  const cfg = await getOpenRouterConfig();
  const row = await db.query.settings.findFirst({ where: eq(settings.id, 1) });
  const persona = row?.activePersona === "theo" ? "테오" : "노라";
  const ready = cfg.apiKeySource !== "none" && cfg.modelSource !== "none";

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-accent">하루등불</h1>
        <LogoutButton />
      </header>

      <div className="rounded-2xl bg-surface p-5">
        <p className="text-sm">
          활성 페르소나: <span className="font-medium">{persona}</span>
        </p>
        <p className="mt-2 text-xs opacity-60">
          OpenRouter 연결:{" "}
          {ready ? (
            <span className="text-accent">준비됨</span>
          ) : (
            <span className="text-red-400">설정 필요</span>
          )}
          {cfg.model && ` · ${cfg.model}`}
        </p>

        <Link
          href="/settings"
          className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
        >
          설정 / API 연결
        </Link>
      </div>

      <p className="mt-6 text-center text-xs opacity-40">
        채팅 · 일기 · 오늘 화면은 다음 단계(M3~)에서 추가됩니다.
      </p>
    </main>
  );
}
