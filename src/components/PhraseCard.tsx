"use client";

import { useEffect, useState } from "react";

// 정적 문구로 즉시 렌더(홈 빠르게) → mount 시 /api/phrase 로 생성형 한마디로 교체.
export default function PhraseCard({ initial }: { initial: string }) {
  const [phrase, setPhrase] = useState(initial);

  useEffect(() => {
    let alive = true;
    fetch("/api/phrase")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.phrase) setPhrase(d.phrase);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="rounded-2xl bg-gradient-to-br from-accent/15 to-surface p-5 text-center">
      <p className="text-sm leading-relaxed">{phrase}</p>
    </section>
  );
}
