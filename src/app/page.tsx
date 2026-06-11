import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import * as settingsRepo from "@/db/repo/settings";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const [llm, s] = await Promise.all([
    getLlmConfig(user.id),
    settingsRepo.getByUser(user.id),
  ]);
  const persona = s?.activePersona === "theo" ? "테오" : "노라";

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-accent">하루등불</h1>
        <div className="flex items-center gap-3 text-xs opacity-70">
          <span>{user.username}</span>
          <LogoutButton />
        </div>
      </header>

      <div className="rounded-2xl bg-surface p-5">
        <p className="text-sm">
          활성 페르소나: <span className="font-medium">{persona}</span>
        </p>
        <p className="mt-2 text-xs opacity-60">
          AI 연결:{" "}
          {llm.configured ? (
            <span className="text-accent">연결됨 · {llm.model}</span>
          ) : (
            <span className="text-red-400">설정 필요 (내 키 입력)</span>
          )}
        </p>

        <div className="mt-4 flex gap-2">
          <Link
            href="/settings"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
          >
            설정
          </Link>
          {user.role === "admin" && (
            <Link
              href="/admin"
              className="rounded-lg bg-bg px-4 py-2 text-sm ring-1 ring-white/10"
            >
              어드민
            </Link>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-xs opacity-40">
        채팅 · 일기 · 오늘 화면은 다음 단계(M3~)에서 추가됩니다.
      </p>
    </main>
  );
}
