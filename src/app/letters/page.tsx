import { requireUser } from "@/lib/currentUser";
import * as lettersRepo from "@/db/repo/letters";
import * as capsulesRepo from "@/db/repo/timeCapsules";
import * as personasRepo from "@/db/repo/personas";
import { isReopenable } from "@/lib/timecapsule";
import LettersView, {
  type SealedCapsule,
  type ReceivedCapsule,
  type WeeklyLetter,
  type PersonaOption,
} from "@/components/LettersView";

export const dynamic = "force-dynamic";

export default async function LettersPage() {
  const user = await requireUser();
  const [letters, capsules, personas] = await Promise.all([
    lettersRepo.listByUser(user.id),
    capsulesRepo.listForUser(user.id),
    personasRepo.listActiveByUser(user.id),
  ]);

  const nameOf = (pid: number | null) =>
    pid ? personas.find((p) => p.id === pid)?.name?.trim() || null : null;

  // 봉인 원칙: 봉인된 캡슐의 content 는 재열기 창(5분) 안에서만 클라이언트로 보낸다.
  const sealed: SealedCapsule[] = [];
  const received: ReceivedCapsule[] = [];
  for (const c of capsules) {
    if (c.deliveredAt) {
      received.push({
        id: c.id,
        deliverOn: c.deliverOn,
        deliveredAt: new Date(c.deliveredAt).toISOString(),
        personaName: nameOf(c.personaId),
        content: c.content,
      });
    } else {
      const reopenable = c.createdAt ? isReopenable(c.createdAt) : false;
      sealed.push({
        id: c.id,
        deliverOn: c.deliverOn,
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
        personaName: nameOf(c.personaId),
        personaId: c.personaId,
        reopenable,
        content: reopenable ? c.content : null,
      });
    }
  }

  const weekly: WeeklyLetter[] = letters.map((l) => ({
    id: l.id,
    weekStart: l.weekStart,
    weekEnd: l.weekEnd,
    body: l.body,
    personaName: l.personaName,
  }));

  const personaOptions: PersonaOption[] = personas.map((p) => ({
    id: p.id,
    name: p.name?.trim() || "이름 없는 캐릭터",
  }));

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold">편지함</h1>
      </div>
      <LettersView
        personas={personaOptions}
        initialSealed={sealed}
        receivedCapsules={received}
        weeklyLetters={weekly}
      />
    </main>
  );
}
