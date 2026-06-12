import NavMenu from "@/components/NavMenu";
import { requireUser } from "@/lib/currentUser";
import * as pocketRepo from "@/db/repo/pocket";
import * as personasRepo from "@/db/repo/personas";
import * as settingsRepo from "@/db/repo/settings";
import PocketCards from "@/components/PocketCards";
import EmergencyChat from "@/components/EmergencyChat";

export const dynamic = "force-dynamic";

export default async function PocketPage() {
  const user = await requireUser();
  const [cards, s] = await Promise.all([
    pocketRepo.listByUser(user.id),
    settingsRepo.getByUser(user.id),
  ]);

  let counselor = s?.eveningPersonaId
    ? await personasRepo.getOne(user.id, s.eveningPersonaId)
    : undefined;
  if (!counselor || !counselor.roles.includes("counselor") || !counselor.isActive) {
    const actives = await personasRepo.listActiveByUser(user.id);
    counselor = actives.find((p) => p.roles.includes("counselor")) ?? actives[0];
  }
  const counselorName = counselor?.name?.trim() || "상담사";

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">비상 주머니</h1>
        <NavMenu isAdmin={user.role === "admin"} username={user.username} />
      </div>

      <p className="rounded-2xl bg-surface p-4 text-sm leading-relaxed opacity-80">
        지금 많이 힘들구나. 천천히 해도 돼. 먼저, 괜찮았던 날의 네가 남겨둔 말부터
        읽어보자.
      </p>

      <PocketCards initial={cards.map((c) => ({ id: c.id, body: c.body }))} />

      <EmergencyChat counselorName={counselorName} />
    </main>
  );
}
