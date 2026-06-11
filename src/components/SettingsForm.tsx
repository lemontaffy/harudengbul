"use client";

import { useState } from "react";

export interface SettingsInitial {
  activePersona: "theo" | "nora";
  proactiveEnabled: boolean;
  morningTime: string;
  eveningTime: string;
  llmBaseUrl: string;
  llmModel: string;
  hasLlmKey: boolean;
  llmKeyMasked: string;
  llmConfigured: boolean;
}

// 공급사 프리셋 = Base URL 자동 채움 (전부 OpenAI 호환)
const PRESETS: { name: string; baseUrl: string }[] = [
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { name: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { name: "Custom", baseUrl: "" },
];

const input =
  "w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-accent";

export default function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const [persona, setPersona] = useState(initial.activePersona);
  const [proactive, setProactive] = useState(initial.proactiveEnabled);
  const [morning, setMorning] = useState(initial.morningTime.slice(0, 5));
  const [evening, setEvening] = useState(initial.eveningTime.slice(0, 5));

  const [baseUrl, setBaseUrl] = useState(initial.llmBaseUrl);
  const [model, setModel] = useState(initial.llmModel);
  const [apiKey, setApiKey] = useState("");
  const [keyView, setKeyView] = useState({
    has: initial.hasLlmKey,
    masked: initial.llmKeyMasked,
    configured: initial.llmConfigured,
  });

  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          activePersona: persona,
          proactiveEnabled: proactive,
          morningTime: morning,
          eveningTime: evening,
          llmBaseUrl: baseUrl,
          llmModel: model,
          llmApiKey: apiKey,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setApiKey("");
        setKeyView({
          has: data.hasLlmKey,
          masked: data.llmKeyMasked,
          configured: data.llmConfigured,
        });
        setStatus("저장됨 ✓");
      } else setStatus(data.error ?? "저장 실패");
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  async function clearKey() {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clearLlmKey: true }),
    });
    const data = await res.json();
    if (res.ok) {
      setKeyView({
        has: data.hasLlmKey,
        masked: data.llmKeyMasked,
        configured: data.llmConfigured,
      });
      setStatus("키 삭제됨");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* AI 연결 (사용자별) */}
      <section className="rounded-2xl bg-surface p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold">AI 연결</h2>
          <span className="text-[11px]">
            {keyView.configured ? (
              <span className="text-accent">연결됨</span>
            ) : (
              <span className="text-red-400">미설정</span>
            )}
          </span>
        </div>
        <p className="mb-4 text-[11px] opacity-50">
          OpenAI 호환. 공급사는 Base URL로 구분(내 키는 나만 사용).
        </p>

        <label className="mb-1 block text-xs opacity-60">공급사 프리셋</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => setBaseUrl(p.baseUrl)}
              className={`rounded-lg px-3 py-1.5 text-xs ${
                baseUrl === p.baseUrl && (p.baseUrl !== "" || baseUrl === "")
                  ? "bg-accent text-black"
                  : "bg-bg ring-1 ring-white/10"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-xs opacity-60">Base URL</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.deepseek.com"
          className={`${input} mb-4`}
        />

        <label className="mb-1 block text-xs opacity-60">API 키</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          placeholder={
            keyView.has
              ? `현재: ${keyView.masked} — 바꾸려면 새 키 입력`
              : "sk-... 입력"
          }
          className={input}
        />
        <div className="mb-4 mt-1 flex items-center justify-end text-[11px]">
          {keyView.has && (
            <button onClick={clearKey} className="opacity-60 hover:text-red-400">
              키 삭제
            </button>
          )}
        </div>

        <label className="mb-1 block text-xs opacity-60">모델</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="deepseek-chat / anthropic/claude-sonnet-4.6 …"
          className={input}
        />
      </section>

      {/* 페르소나 */}
      <section className="rounded-2xl bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">활성 페르소나</h2>
        <div className="flex gap-2">
          {(["nora", "theo"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPersona(p)}
              className={`rounded-lg px-4 py-2 text-sm ${
                persona === p ? "bg-accent text-black" : "bg-bg ring-1 ring-white/10"
              }`}
            >
              {p === "nora" ? "노라" : "테오"}
            </button>
          ))}
        </div>
      </section>

      {/* 선제 톡 */}
      <section className="rounded-2xl bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">선제 톡</h2>
          <button
            type="button"
            onClick={() => setProactive((v) => !v)}
            className={`h-6 w-11 rounded-full transition ${
              proactive ? "bg-accent" : "bg-white/15"
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white transition ${
                proactive ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        <p className="mb-3 text-[11px] opacity-50">
          아침/저녁 먼저 말 걸기 (실제 발송은 Phase 2).
        </p>
        <div className="flex gap-3">
          <label className="flex-1 text-xs opacity-60">
            아침
            <input
              type="time"
              value={morning}
              onChange={(e) => setMorning(e.target.value)}
              className={`${input} mt-1`}
            />
          </label>
          <label className="flex-1 text-xs opacity-60">
            저녁
            <input
              type="time"
              value={evening}
              onChange={(e) => setEvening(e.target.value)}
              className={`${input} mt-1`}
            />
          </label>
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
