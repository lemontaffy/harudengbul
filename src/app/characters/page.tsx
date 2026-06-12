import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/currentUser";
import type { Role } from "@/lib/persona";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import CharacterManager, {
  type Character,
  type TriggerAssignments,
} from "@/components/CharacterManager";

export const dynamic = "force-dynamic";

export default async function CharactersPage() {
  const user = await requireUser();
  const [s, personaRows] = await Promise.all([
    settingsRepo.getByUser(user.id),
    personasRepo.listActiveByUser(user.id),
  ]);

  const characters: Character[] = personaRows.map((p) => ({
    id: p.id,
    name: p.name,
    roles: p.roles as Role[],
    avatarPath: p.avatarPath,
    traits: p.traits,
  }));
  const triggers: TriggerAssignments = {
    activePersonaId: s?.activePersonaId ?? null,
    diaryReplyPersonaId: s?.diaryReplyPersonaId ?? null,
    morningPersonaId: s?.morningPersonaId ?? null,
    eveningPersonaId: s?.eveningPersonaId ?? null,
  };

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center gap-2">
        <Link href="/chat" aria-label="뒤로" className="-ml-1.5 rounded-control p-1 opacity-80 hover:bg-surface-2">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-display text-lg font-semibold">캐릭터</h1>
      </div>
      <CharacterManager initialCharacters={characters} initialTriggers={triggers} />
    </main>
  );
}
