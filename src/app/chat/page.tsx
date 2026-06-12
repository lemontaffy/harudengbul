import { requireUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import type { Role } from "@/lib/persona";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import ChatView, { type ChatPersona } from "@/components/ChatView";
import NavMenu from "@/components/NavMenu";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await requireUser();
  const [llm, s, personaRows] = await Promise.all([
    getLlmConfig(user.id),
    settingsRepo.getByUser(user.id),
    personasRepo.listActiveByUser(user.id),
  ]);
  const personas: ChatPersona[] = personaRows.map((p) => ({
    id: p.id,
    name: p.name,
    roles: p.roles as Role[],
    avatarPath: p.avatarPath,
  }));

  return (
    <main className="mx-auto flex h-screen max-w-md flex-col p-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-semibold text-accent">대화</h1>
        <NavMenu isAdmin={user.role === "admin"} username={user.username} />
      </header>

      <ChatView
        personas={personas}
        initialPersonaId={s?.activePersonaId ?? null}
        userAvatarPath={s?.userAvatarPath ?? null}
        configured={llm.configured}
      />
    </main>
  );
}
