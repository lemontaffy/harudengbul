"use client";

import { useState } from "react";

interface ModelItem {
  id: string;
  name?: string;
  contextLength?: number;
  pricePrompt?: string;
  priceCompletion?: string;
}

function ctxLabel(n?: number): string {
  return n ? `${Math.round(n / 1000)}k` : "";
}
function priceLabel(p?: string): string {
  if (!p) return "";
  const v = Number(p) * 1e6; // per-token → per 1M
  return isFinite(v) && v > 0 ? `$${v.toFixed(2)}/M` : "";
}

export interface SettingsInitial {
  proactiveEnabled: boolean;
  handoffEnabled: boolean;
  morningTime: string;
  eveningTime: string;
  llmBaseUrl: string;
  llmModel: string;
  llmEmbeddingModel: string;
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
  const [proactive, setProactive] = useState(initial.proactiveEnabled);
  const [handoff, setHandoff] = useState(initial.handoffEnabled);
  const [morning, setMorning] = useState(initial.morningTime.slice(0, 5));
  const [evening, setEvening] = useState(initial.eveningTime.slice(0, 5));

  const [baseUrl, setBaseUrl] = useState(initial.llmBaseUrl);
  const [model, setModel] = useState(initial.llmModel);
  const [embedModel, setEmbedModel] = useState(initial.llmEmbeddingModel);
  const [apiKey, setApiKey] = useState("");
  const [keyView, setKeyView] = useState({
    has: initial.hasLlmKey,
    masked: initial.llmKeyMasked,
    configured: initial.llmConfigured,
  });

  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // 모델 자동 검색
  const [models, setModels] = useState<ModelItem[]>([]);
  const [modelsSource, setModelsSource] = useState("");
  const [modelsMsg, setModelsMsg] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelQuery, setModelQuery] = useState("");

  async function loadModels() {
    setLoadingModels(true);
    setModelsMsg("");
    try {
      // 검색은 "저장된" 연결을 쓰므로, 현재 base_url/키를 먼저 서버에 반영
      // (키는 입력했을 때만 전송 — 비우면 기존 키 유지).
      await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ llmBaseUrl: baseUrl, llmApiKey: apiKey }),
      });
      if (apiKey) {
        setApiKey("");
        setKeyView((v) => ({ ...v, has: true }));
      }
      const res = await fetch("/api/settings/models");
      const data = await res.json();
      if (res.ok) {
        setModels(data.models ?? []);
        setModelsSource(data.source ?? "");
        setModelsMsg(
          `${(data.models ?? []).length}개${data.cached ? " · 캐시" : ""}`,
        );
      } else {
        setModels([]);
        setModelsMsg(data.error ?? "불러오기 실패 — 직접 입력하세요");
      }
    } catch {
      setModelsMsg("네트워크 오류 — 직접 입력하세요");
    } finally {
      setLoadingModels(false);
    }
  }

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proactiveEnabled: proactive,
          handoffEnabled: handoff,
          morningTime: morning,
          eveningTime: evening,
          llmBaseUrl: baseUrl,
          llmModel: model,
          llmEmbeddingModel: embedModel,
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

        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs opacity-60">모델</label>
          <button
            type="button"
            onClick={loadModels}
            disabled={loadingModels}
            className="text-[11px] text-accent disabled:opacity-40"
          >
            {loadingModels ? "불러오는 중…" : "↻ 모델 불러오기"}
          </button>
        </div>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="deepseek-chat / anthropic/claude-sonnet-4.6 …"
          className={input}
        />
        {modelsMsg && (
          <p className="mt-1 text-[11px] opacity-50">
            {modelsMsg}
            {modelsSource && ` · ${modelsSource}`}
          </p>
        )}
        {models.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-white/10">
            <input
              value={modelQuery}
              onChange={(e) => setModelQuery(e.target.value)}
              placeholder="검색…"
              className="w-full bg-bg px-3 py-1.5 text-xs outline-none"
            />
            <ul className="max-h-48 overflow-auto">
              {models
                .filter((m) =>
                  m.id.toLowerCase().includes(modelQuery.toLowerCase()),
                )
                .slice(0, 80)
                .map((m) => {
                  const meta = [ctxLabel(m.contextLength), priceLabel(m.pricePrompt)]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setModel(m.id);
                          setModelQuery("");
                        }}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/5 ${
                          model === m.id ? "text-accent" : ""
                        }`}
                      >
                        <span className="truncate">{m.id}</span>
                        {meta && (
                          <span className="shrink-0 opacity-40">{meta}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}

        <label className="mt-4 block text-xs opacity-60">임베딩 모델 (의미 기억 검색용, 선택)</label>
        <input
          value={embedModel}
          onChange={(e) => setEmbedModel(e.target.value)}
          placeholder="text-embedding-3-small (비우면 기본값)"
          className={`${input} mt-1`}
        />
        <p className="mt-1 text-[11px] opacity-50">
          1536차원 모델만 지원. 비우거나 미지원이면 중요도순으로 기억을 불러와요.
        </p>
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
          아침/저녁 먼저 말 걸기. 알림을 켜면 푸시로도 와요.
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

      {/* 상담→비서 핸드오프 */}
      <section className="rounded-2xl bg-surface p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">상담→비서 전달</h2>
          <button
            type="button"
            onClick={() => setHandoff((v) => !v)}
            className={`h-6 w-11 rounded-full transition ${
              handoff ? "bg-accent" : "bg-white/15"
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white transition ${
                handoff ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        <p className="text-[11px] opacity-50">
          상담 중 할 일이 나오면 동의를 받아 비서에게 전달하고, 홈 카드에서 등록할 수 있어요.
          끄면 상담가가 전달 제안을 하지 않습니다.
        </p>
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
