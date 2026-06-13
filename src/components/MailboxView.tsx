"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ReplyItem {
  id: number;
  petName: string;
  avatar: string | null;
  content: string;
  letterContent: string;
  read: boolean;
  createdAt: string;
}

const input = "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MailboxView({
  replies,
  pets,
  canSend,
  perDay,
}: {
  replies: ReplyItem[];
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
  const [readIds, setReadIds] = useState<Set<number>>(new Set());

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

  async function open(r: ReplyItem) {
    setOpenId((id) => (id === r.id ? null : r.id));
    if (!r.read && !readIds.has(r.id)) {
      setReadIds((s) => new Set(s).add(r.id));
      await fetch(`/api/pet-letters/${r.id}/read`, { method: "POST" }).catch(() => {});
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

      {replies.length === 0 ? (
        <p className="py-12 text-center text-sm opacity-40">아직 받은 답장이 없어요. 편지를 보내면 답장이 와요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {replies.map((r) => {
            const unread = !r.read && !readIds.has(r.id);
            const opened = openId === r.id;
            return (
              <li key={r.id} className="rounded-card bg-surface p-3 ring-1 ring-border">
                <button onClick={() => open(r)} className="flex w-full items-center gap-3 text-left">
                  {r.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full bg-bg object-contain" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg text-lg">🐾</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      {r.petName}의 답장
                      {unread && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                    </div>
                    <div className="truncate text-[11px] opacity-50">{fmt(r.createdAt)}</div>
                  </div>
                </button>
                {opened && (
                  <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.content}</p>
                    <details className="text-[11px] opacity-50">
                      <summary className="cursor-pointer">내가 보낸 편지</summary>
                      <p className="mt-1 whitespace-pre-wrap">{r.letterContent}</p>
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
