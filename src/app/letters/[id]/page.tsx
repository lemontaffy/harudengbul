import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/currentUser";
import * as lettersRepo from "@/db/repo/letters";

export const dynamic = "force-dynamic";

function fmtRange(ws: string, we: string): string {
  const f = (s: string) =>
    new Date(s + "T00:00:00Z").toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${f(ws)} ~ ${f(we)}`;
}

export default async function LetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const lid = Number(id);
  const letter = Number.isInteger(lid)
    ? await lettersRepo.getOne(user.id, lid)
    : undefined;
  if (!letter) notFound();

  const paragraphs = letter.body
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="flex items-center justify-between">
        <Link href="/letters" className="text-sm opacity-60 hover:opacity-100">
          ← 편지함
        </Link>
      </div>

      <article className="mt-4 overflow-hidden rounded-[28px] bg-gradient-to-b from-[#2b2433] to-[#211f2b] p-7 ring-1 ring-accent">
        <header className="mb-6 text-center">
          <div className="text-3xl">📮</div>
          <h1 className="font-display mt-2 text-sm font-semibold tracking-wide text-accent">
            주간 회고 편지
          </h1>
          <p className="mt-1 text-[11px] opacity-50">
            {fmtRange(letter.weekStart, letter.weekEnd)}
          </p>
          <div className="mx-auto mt-4 h-px w-16 bg-accent-soft" />
        </header>

        <div className="space-y-4 font-serif text-[15px] leading-8 text-[#ece4d8]">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <p className="mt-8 text-right font-serif text-sm italic opacity-70">
          — {letter.personaName ?? "상담사"}
        </p>
      </article>
    </main>
  );
}
