import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import type { Role } from "@/lib/persona";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import LogoutButton from "@/components/LogoutButton";
import ChatView, { type ChatPersona } from "@/components/ChatView";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const [llm, s, personaRows] = await Promise.all([
    getLlmConfig(user.id),
    settingsRepo.getByUser(user.id),
    personasRepo.listActiveByUser(user.id),
  ]);
  const personas: ChatPersona[] = personaRows.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role as Role,
    avatarPath: p.avatarPath,
  }));

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

      <ChatView
        personas={personas}
        initialPersonaId={s?.activePersonaId ?? null}
        configured={llm.configured}
      />
    </main>
  );
}
