"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface CardReply {
  id: number;
  petName: string;
  avatar: string | null;
  arrived: boolean; // false면 아직 안 옴(플레이스홀더)
  content: string;
  read: boolean;
}
export interface LetterCard {
  letterId: number;
  toAll: boolean;
  letterContent: string;
  sentAt: string; // ISO
  replies: CardReply[];
}

const input = "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Avatar({ src }: { src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-9 w-9 shrink-0 rounded-full bg-bg object-contain" />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-base">🐾</span>
  );
}

export default function MailboxView({
  cards,
  pets,
  canSend,
  perDay,
}: {
  cards: LetterCard[];
  pets: { id: number; name: string }[];
  canSend: boolean;
  perDay: number;
}) {
  const router = useRouter();
  const [writing, setWriting] = useState(false);
  const [to, setTo] = useState<number | null>(null); // null = 모두에게
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [readLetters, setReadLetters] = useState<Set<number>>(new Set()); // 낙관적 읽음

  async function send() {
    if (!content.trim()) return setStatus("편지 내용을 입력하세요.");
    setSending(true);
    setStatus("");
    try {
      const res = await fetch("/api/pet-letters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toPetId: to, content: content.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setContent("");
        setWriting(false);
        setStatus(`편지를 보냈어요. 답장은 잠시 후 도착해요(${data.scheduled}마리).`);
        router.refresh();
      } else {
        setStatus(data.error ?? "발송 실패");
      }
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setSending(false);
    }
  }

  // 카드 열기 — 합본이면 그 편지의 도착 답장 전체를 읽음 처리(개별 안 눌러도 됨).
  async function openCard(card: LetterCard) {
    setOpenId((id) => (id === card.letterId ? null : card.letterId));
    const hasUnread = card.replies.some((r) => r.arrived && !r.read) && !readLetters.has(card.letterId);
    if (hasUnread) {
      setReadLetters((s) => new Set(s).add(card.letterId));
      await fetch(`/api/pet-letters/letter/${card.letterId}/read`, { method: "POST" }).catch(() => {});
      router.refresh(); // 우체통 active(안 읽음) 갱신
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs opacity-60">{status}</span>
        {!writing && (
          <button onClick={() => setWriting(true)} className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black">
            편지 쓰기
          </button>
        )}
      </div>

      {writing && (
        <section className="flex flex-col gap-2 rounded-card bg-surface p-4">
          {!canSend ? (
            <p className="py-4 text-center text-sm opacity-50">
              오늘 편지는 다 보냈어요(하루 {perDay}통). 내일 다시 쓸 수 있어요.
            </p>
          ) : (
            <>
              <select value={to ?? ""} onChange={(e) => setTo(e.target.value ? Number(e.target.value) : null)} className={input}>
                <option value="">모두에게</option>
                {pets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}에게
                  </option>
                ))}
              </select>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="펫에게 전하고 싶은 말을 적어요. 하루 한 통, 답장이 와요."
                className={`${input} resize-none`}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setWriting(false)} className="rounded-control px-4 py-2 text-sm opacity-60 ring-1 ring-border">
                  취소
                </button>
                <button onClick={send} disabled={sending} className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
                  {sending ? "보내는 중…" : "보내기"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {cards.length === 0 ? (
        <p className="py-12 text-center text-sm opacity-40">아직 받은 답장이 없어요. 편지를 보내면 답장이 와요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map((card) => {
            const arrived = card.replies.filter((r) => r.arrived);
            const waiting = card.replies.filter((r) => !r.arrived);
            const unread = !readLetters.has(card.letterId) && arrived.some((r) => !r.read);
            const opened = openId === card.letterId;
            const title = card.toAll ? "모두에게" : `${card.replies[0]?.petName ?? "펫"}에게`;
            const summary = card.toAll
              ? `답장 ${arrived.length}/${card.replies.length}`
              : arrived.length
                ? "답장 도착"
                : "답장 기다리는 중";
            return (
              <li key={card.letterId} className="rounded-card bg-surface p-3 ring-1 ring-border">
                <button onClick={() => openCard(card)} className="flex w-full items-center gap-3 text-left">
                  {/* 합본은 앞 3개 아바타 겹쳐 보이기, 개별은 단일 */}
                  <div className="flex shrink-0 -space-x-3">
                    {card.replies.slice(0, 3).map((r) => (
                      <span key={r.id} className={r.arrived ? "" : "opacity-40"}>
                        <Avatar src={r.avatar} />
                      </span>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{card.toAll ? "모두의 답장" : `${title.replace("에게", "")}의 답장`}</span>
                      {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    </div>
                    <div className="truncate text-[11px] opacity-50">
                      {fmt(card.sentAt)} · {summary}
                    </div>
                  </div>
                </button>

                {opened && (
                  <div className="mt-2 flex flex-col gap-3 border-t border-border pt-2">
                    {arrived.map((r) => (
                      <div key={r.id} className="flex gap-2.5">
                        <Avatar src={r.avatar} />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium opacity-80">{r.petName}</div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.content}</p>
                        </div>
                      </div>
                    ))}
                    {waiting.map((r) => (
                      <div key={r.id} className="flex items-center gap-2.5 opacity-50">
                        <Avatar src={r.avatar} />
                        <span className="text-xs italic">{r.petName} 답장 기다리는 중…</span>
                      </div>
                    ))}
                    <details className="text-[11px] opacity-50">
                      <summary className="cursor-pointer">내가 보낸 편지</summary>
                      <p className="mt-1 whitespace-pre-wrap">{card.letterContent}</p>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
