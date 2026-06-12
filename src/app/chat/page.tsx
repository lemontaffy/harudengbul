import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { requireUser } from "@/lib/currentUser";
import { ROLE_LABEL, type Role } from "@/lib/persona";
import * as personasRepo from "@/db/repo/personas";
import * as messagesRepo from "@/db/repo/messages";

export const dynamic = "force-dynamic";

function previewTime(iso: Date | string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

export default async function ChatListPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  // 딥링크 호환: 기존 /chat?persona=N → /chat/N
  if (sp.persona && /^\d+$/.test(sp.persona)) redirect(`/chat/${sp.persona}`);

  const personas = await personasRepo.listActiveByUser(user.id);
  const cards = await Promise.all(
    personas.map(async (p) => {
      const [last, unread] = await Promise.all([
        messagesRepo.lastMessage(user.id, p.id),
        messagesRepo.countUnread(user.id, p.id, p.lastReadAt ?? null),
      ]);
      return { p, last, unread };
    }),
  );
  // 마지막 메시지 시각 내림차순, 메시지 없는 캐릭터는 하단.
  cards.sort((a, b) => {
    const ta = a.last?.createdAt ? new Date(a.last.createdAt).getTime() : -1;
    const tb = b.last?.createdAt ? new Date(b.last.createdAt).getTime() : -1;
    return tb - ta;
  });

  return (
    <main className="mx-auto max-w-md p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-semibold text-accent">대화</h1>
        <Link
          href="/characters"
          className="flex items-center gap-1 text-[11px] text-accent"
        >
          <Users size={13} /> 캐릭터 관리
        </Link>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-2xl bg-surface p-6 text-center text-sm opacity-70">
          아직 대화할 캐릭터가 없어요.
          <Link href="/characters" className="mt-2 block text-accent">
            캐릭터 추가하기
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map(({ p, last, unread }) => {
            const name = p.name?.trim() || "이름 없는 캐릭터";
            const roleLabel = (p.roles as Role[]).map((r) => ROLE_LABEL[r]).join(" · ");
            const preview = last
              ? `${last.role === "user" ? "나: " : ""}${last.content}`
              : "대화를 시작해 보세요";
            return (
              <li key={p.id}>
                <Link
                  href={`/chat/${p.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-white/5 hover:ring-accent/40"
                >
                  {p.avatarPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatarPath} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-full bg-white/10" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{name}</span>
                      <span className="shrink-0 text-[10px] opacity-40">{roleLabel}</span>
                      <span className="ml-auto shrink-0 text-[10px] opacity-40">
                        {previewTime(last?.createdAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-xs opacity-50">{preview}</p>
                      {unread > 0 && (
                        <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] font-bold leading-5 text-black">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
