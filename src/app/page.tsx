import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import * as settingsRepo from "@/db/repo/settings";
import LogoutButton from "@/components/LogoutButton";
import ChatView from "@/components/ChatView";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const [llm, s] = await Promise.all([
    getLlmConfig(user.id),
    settingsRepo.getByUser(user.id),
  ]);
  const persona = s?.activePersona === "theo" ? "theo" : "nora";

  return (
    <main className="mx-auto flex h-screen max-w-md flex-col p-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-semibold text-accent">하루등불</h1>
        <div className="flex items-center gap-3 text-xs opacity-70">
          <span>{user.username}</span>
          <Link href="/settings" className="hover:opacity-100">
            설정
          </Link>
          {user.role === "admin" && (
            <Link href="/admin" className="hover:opacity-100">
              어드민
            </Link>
          )}
          <LogoutButton />
        </div>
      </header>

      <ChatView initialPersona={persona} configured={llm.configured} />
    </main>
  );
}
