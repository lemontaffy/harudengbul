"use client";

import { useEffect, useState } from "react";

interface WeatherResp {
  configured: boolean;
  unavailable?: boolean;
  tempC?: number | null;
  sky?: "clear" | "partly" | "cloudy" | null;
  hasRain?: boolean;
  hasSnow?: boolean;
  summary?: string;
}

function emojiOf(w: WeatherResp): string {
  if (w.hasSnow) return "🌨️";
  if (w.hasRain) return "🌧️";
  if (w.sky === "clear") return "☀️";
  if (w.sky === "partly") return "⛅";
  if (w.sky === "cloudy") return "☁️";
  return "🌡️";
}

export default function WeatherSlot() {
  const [w, setW] = useState<WeatherResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/weather")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setW(d);
      })
      .catch(() => alive && setW({ configured: true, unavailable: true }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const base =
    "flex w-32 flex-col items-center justify-center rounded-2xl bg-surface p-4 text-center";

  if (loading) {
    return (
      <div className={base}>
        <span className="text-2xl opacity-30">⛅</span>
        <span className="mt-1 text-[11px] opacity-40">불러오는 중…</span>
      </div>
    );
  }
  if (!w || w.configured === false) {
    return (
      <a href="/settings" className={`${base} hover:ring-1 hover:ring-accent/40`}>
        <span className="text-2xl opacity-40">📍</span>
        <span className="mt-1 text-[11px] opacity-60">위치 설정</span>
      </a>
    );
  }
  if (w.unavailable) {
    return (
      <div className={base}>
        <span className="text-2xl opacity-30">⛅</span>
        <span className="mt-1 text-[11px] opacity-40">날씨 준비 중</span>
      </div>
    );
  }

  return (
    <div className={base}>
      <span className="text-2xl">{emojiOf(w)}</span>
      <span className="mt-0.5 text-lg font-semibold">
        {w.tempC != null ? `${w.tempC}°` : "—"}
      </span>
      <span className="text-[11px] opacity-60">{w.summary}</span>
      {(w.hasRain || w.hasSnow) && (
        <span className="mt-1 rounded-full bg-accent/20 px-1.5 text-[10px] text-accent">
          ☔ {w.hasSnow ? "눈" : "비"} 예보
        </span>
      )}
    </div>
  );
}
