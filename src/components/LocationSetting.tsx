"use client";

import { useState } from "react";

export interface LocationInitial {
  locationLat: number | null;
  locationLon: number | null;
  hasLocation: boolean;
}

const inputCls =
  "w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-accent";

export default function LocationSetting({ initial }: { initial: LocationInitial }) {
  const [lat, setLat] = useState(initial.locationLat?.toString() ?? "");
  const [lon, setLon] = useState(initial.locationLon?.toString() ?? "");
  const [has, setHas] = useState(initial.hasLocation);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function save(latVal: string, lonVal: string) {
    const la = Number(latVal);
    const lo = Number(lonVal);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
      setStatus("좌표가 올바르지 않아요.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationLat: la, locationLon: lo }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setStatus(d.error ?? "저장 실패");
        return;
      }
      setHas(true);
      setStatus("위치 저장됨 ✓");
      // 날씨 캐시 워밍(첫 표시 빠르게) — 실패해도 무시
      fetch("/api/weather").catch(() => {});
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  function useCurrent() {
    if (!("geolocation" in navigator)) {
      setStatus("이 브라우저는 위치를 지원하지 않아요.");
      return;
    }
    setBusy(true);
    setStatus("위치 확인 중…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude.toFixed(4);
        const lo = pos.coords.longitude.toFixed(4);
        setLat(la);
        setLon(lo);
        save(la, lo);
      },
      (err) => {
        setBusy(false);
        setStatus(
          err.code === err.PERMISSION_DENIED
            ? "위치 권한이 거부됐어요. 수동 입력해 주세요."
            : "위치를 가져오지 못했어요.",
        );
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <section className="rounded-2xl bg-surface p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold">위치(날씨)</h2>
        {status && <span className="text-[11px] opacity-60">{status}</span>}
      </div>
      <p className="mb-4 text-[11px] opacity-50">
        대시보드 날씨와 비/눈 안내에 쓰여요. {has ? "설정됨." : "아직 미설정."}
      </p>

      <button
        onClick={useCurrent}
        disabled={busy}
        className="mb-3 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
      >
        {busy ? "처리 중…" : "📍 현재 위치 사용"}
      </button>

      <div className="flex items-end gap-2">
        <label className="flex-1 text-xs opacity-60">
          위도
          <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="37.5665" className={`${inputCls} mt-1`} />
        </label>
        <label className="flex-1 text-xs opacity-60">
          경도
          <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="126.9780" className={`${inputCls} mt-1`} />
        </label>
        <button
          onClick={() => save(lat, lon)}
          disabled={busy}
          className="rounded-lg bg-bg px-4 py-2 text-sm ring-1 ring-white/10 disabled:opacity-50"
        >
          저장
        </button>
      </div>
    </section>
  );
}
