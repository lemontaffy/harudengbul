import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import * as lettersRepo from "@/db/repo/letters";
import GenerateLetterButton from "@/components/GenerateLetterButton";

export const dynamic = "force-dynamic";

function fmtRange(ws: string, we: string): string {
  const f = (s: string) =>
    new Date(s + "T00:00:00Z").toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${f(ws)} ~ ${f(we)}`;
}

export default async function LettersPage() {
  const user = await requireUser();
  const letters = await lettersRepo.listByUser(user.id);

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold">편지함</h1>
      </div>

      <GenerateLetterButton />

      {letters.length === 0 ? (
        <p className="py-12 text-center text-sm leading-relaxed opacity-40">
          아직 편지가 없어요.
          <br />
          일요일 저녁에 상담사가 한 주 회고 편지를 보내줘요.
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {letters.map((l) => (
            <li key={l.id}>
              <Link
                href={`/letters/${l.id}`}
                className="block rounded-2xl bg-surface p-4 ring-1 ring-white/10 transition hover:ring-accent/40"
              >
                <div className="flex items-center gap-1.5 text-xs text-accent">
                  <span>📮</span>
                  <span>{fmtRange(l.weekStart, l.weekEnd)}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm opacity-70">{l.body}</p>
                {l.personaName && (
                  <p className="mt-1 text-[11px] opacity-40">— {l.personaName}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
