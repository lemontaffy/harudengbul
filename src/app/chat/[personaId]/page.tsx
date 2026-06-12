import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import { ROLE_LABEL, type Role } from "@/lib/persona";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import ChatView from "@/components/ChatView";

export const dynamic = "force-dynamic";

export default async function ChatRoomPage({
  params,
}: {
  params: Promise<{ personaId: string }>;
}) {
  const user = await requireUser();
  const { personaId: raw } = await params;
  const personaId = Number(raw);
  if (!Number.isInteger(personaId)) notFound();

  const [persona, s, llm] = await Promise.all([
    personasRepo.getOne(user.id, personaId),
    settingsRepo.getByUser(user.id),
    getLlmConfig(user.id),
  ]);
  if (!persona || !persona.isActive) redirect("/chat");

  const roleLabel = (persona.roles as Role[]).map((r) => ROLE_LABEL[r]).join(" · ");
  const name = persona.name?.trim() || "이름 없는 캐릭터";

  return (
    <main className="mx-auto flex h-[100dvh] max-w-md flex-col px-4">
      <header className="flex items-center gap-2.5 border-b border-white/10 py-2.5">
        <Link href="/chat" aria-label="뒤로" className="-ml-1.5 rounded-lg p-1 opacity-80 hover:bg-white/5">
          <ChevronLeft size={22} />
        </Link>
        {persona.avatarPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={persona.avatarPath} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-white/10" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="truncate text-[11px] opacity-50">{roleLabel}</div>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ChatView
          persona={{
            id: persona.id,
            name: persona.name,
            roles: persona.roles as Role[],
            avatarPath: persona.avatarPath,
          }}
          userAvatarPath={s?.userAvatarPath ?? null}
          configured={llm.configured}
        />
      </div>
    </main>
  );
}
