"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ConnLite {
  id: number;
  name: string;
}

export default function ConnectionSwitcher({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [conns, setConns] = useState<ConnLite[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/connections")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setConns(d.connections.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));
          setActiveId(d.activeId);
        }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  async function onChange(id: number) {
    setActiveId(id);
    await fetch(`/api/connections/${id}/activate`, { method: "POST" });
    router.refresh();
  }

  if (!ready) return null;
  if (conns.length === 0) {
    return (
      <a href="/settings" className={`${className} text-accent`}>
        AI 연결 설정
      </a>
    );
  }
  if (conns.length === 1) {
    return <span className={`${className} opacity-60`}>{conns[0].name}</span>;
  }
  return (
    <select
      value={activeId ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`${className} rounded-lg bg-surface px-2 py-1 text-xs outline-none ring-1 ring-white/10`}
      title="메인 AI 연결"
    >
      {conns.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
