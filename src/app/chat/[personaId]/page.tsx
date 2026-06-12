import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/currentUser";
import { getLlmConfig } from "@/lib/config";
import { ROLE_LABEL, type Role } from "@/lib/persona";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import ChatView from "@/components/ChatView";
import RoomHeader from "@/components/RoomHeader";

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
    <main className="mx-auto flex h-[100svh] max-w-md flex-col px-4">
      <RoomHeader
        persona={{
          id: persona.id,
          name,
          roleLabel,
          avatarPath: persona.avatarPath,
          traits: persona.traits,
        }}
      />

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
          supportsVision={llm.supportsVision}
        />
      </div>
    </main>
  );
}
