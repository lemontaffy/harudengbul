"use client";

import { useState } from "react";

type Source = "db" | "env" | "none";

export interface SettingsInitial {
  model: string;
  modelSource: Source;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
  apiKeySource: Source;
  activePersona: "theo" | "nora";
}

function sourceBadge(source: Source) {
  if (source === "db") return <span className="text-accent">DB(화면 설정)</span>;
  if (source === "env") return <span className="opacity-60">env(.env 기본값)</span>;
  return <span className="text-red-400">미설정</span>;
}

export default function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const [model, setModel] = useState(initial.model);
  const [baseUrl, setBaseUrl] = useState(
    initial.baseUrl === "https://openrouter.ai/api/v1" ? "" : initial.baseUrl,
  );
  const [apiKey, setApiKey] = useState("");
  const [persona, setPersona] = useState<"theo" | "nora">(initial.activePersona);

  const [status, setStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState({
    apiKeySource: initial.apiKeySource,
    apiKeyMasked: initial.apiKeyMasked,
    modelSource: initial.modelSource,
  });

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          openrouterModel: model,
          openrouterBaseUrl: baseUrl,
          openrouterApiKey: apiKey, // 빈 값이면 서버가 변경 안 함
          activePersona: persona,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setApiKey("");
        setView({
          apiKeySource: data.apiKeySource,
          apiKeyMasked: data.apiKeyMasked,
          modelSource: data.modelSource,
        });
        setStatus("저장됨 ✓");
      } else {
        setStatus(data.error ?? "저장 실패");
      }
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  async function clearKey() {
    setSaving(true);
    setStatus("");
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clearApiKey: true }),
    });
    const data = await res.json();
    if (res.ok) {
      setView({
        apiKeySource: data.apiKeySource,
        apiKeyMasked: data.apiKeyMasked,
        modelSource: data.modelSource,
      });
      setStatus("DB 키 삭제됨 (env 폴백)");
    }
    setSaving(false);
  }

  const label = "block text-xs opacity-60 mb-1";
  const input =
    "w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-accent";

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">OpenRouter 연결</h2>

        <div className="mb-4">
          <label className={label}>API 키</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              view.apiKeySource !== "none"
                ? `현재: ${view.apiKeyMasked} — 바꾸려면 새 키 입력`
                : "sk-or-... 입력"
            }
            className={input}
            autoComplete="off"
          />
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span>출처: {sourceBadge(view.apiKeySource)}</span>
            {view.apiKeySource === "db" && (
              <button
                type="button"
                onClick={clearKey}
                className="opacity-60 hover:text-red-400 hover:opacity-100"
              >
                DB 키 삭제
              </button>
            )}
          </div>
        </div>

        <div className="mb-4">
          <label className={label}>모델</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="anthropic/claude-sonnet-4.6"
            className={input}
          />
          <p className="mt-1 text-[11px]">출처: {sourceBadge(view.modelSource)}</p>
        </div>

        <div>
          <label className={label}>Base URL (선택)</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://openrouter.ai/api/v1 (기본값)"
            className={input}
          />
        </div>
      </section>

      <section className="rounded-2xl bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">활성 페르소나</h2>
        <div className="flex gap-2">
          {(["nora", "theo"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPersona(p)}
              className={`rounded-lg px-4 py-2 text-sm ${
                persona === p
                  ? "bg-accent text-black"
                  : "bg-bg ring-1 ring-white/10"
              }`}
            >
              {p === "nora" ? "노라" : "테오"}
            </button>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        {status && <span className="text-xs opacity-70">{status}</span>}
      </div>
    </div>
  );
}
