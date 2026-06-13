"use client";

import { useCallback, useEffect, useState } from "react";
import { useDialog } from "@/components/ui/Dialog";

interface Conn {
  id: number;
  name: string;
  baseUrl: string;
  model: string;
  embeddingModel: string;
  supportsVision: boolean;
  hasKey: boolean;
  keyMasked: string;
}
interface ModelItem {
  id: string;
  contextLength?: number;
  pricePrompt?: string;
}

const PRESETS: { name: string; baseUrl: string }[] = [
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { name: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { name: "Custom", baseUrl: "" },
];
const input =
  "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";
const ctxLabel = (n?: number) => (n ? `${Math.round(n / 1000)}k` : "");
const priceLabel = (p?: string) => {
  if (!p) return "";
  const v = Number(p) * 1e6;
  return isFinite(v) && v > 0 ? `$${v.toFixed(2)}/M` : "";
};
function host(u: string) {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

const EMPTY = {
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "",
  embeddingModel: "",
  supportsVision: false,
};

export default function ConnectionsManager() {
  const dialog = useDialog();
  const [conns, setConns] = useState<Conn[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [auxId, setAuxId] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [keyView, setKeyView] = useState<{ has: boolean; masked: string }>({ has: false, masked: "" });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const [models, setModels] = useState<ModelItem[]>([]);
  const [modelQuery, setModelQuery] = useState("");
  const [modelsMsg, setModelsMsg] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/connections");
    if (res.ok) {
      const d = await res.json();
      setConns(d.connections);
      setActiveId(d.activeId);
      setAuxId(d.auxId ?? null);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function setAux(id: number | null) {
    setAuxId(id);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ auxConnectionId: id }),
    });
  }

  function openNew() {
    setEditing("new");
    setForm({ ...EMPTY });
    setKeyView({ has: false, masked: "" });
    setModels([]);
    setModelsMsg("");
    setStatus("");
  }
  function openEdit(c: Conn) {
    setEditing(c.id);
    setForm({
      name: c.name,
      baseUrl: c.baseUrl,
      apiKey: "",
      model: c.model,
      embeddingModel: c.embeddingModel,
      supportsVision: c.supportsVision,
    });
    setKeyView({ has: c.hasKey, masked: c.keyMasked });
    setModels([]);
    setModelsMsg("");
    setStatus("");
  }

  async function save() {
    if (!form.name.trim()) {
      setStatus("이름을 입력하세요.");
      return;
    }
    setSaving(true);
    setStatus("");
    const body: Record<string, unknown> = {
      name: form.name,
      baseUrl: form.baseUrl,
      model: form.model,
      embeddingModel: form.embeddingModel,
      supportsVision: form.supportsVision,
    };
    if (form.apiKey.trim()) body.apiKey = form.apiKey.trim();
    const url = editing === "new" ? "/api/connections" : `/api/connections/${editing}`;
    const method = editing === "new" ? "POST" : "PATCH";
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(null);
      await load();
    } else {
      const d = await res.json().catch(() => ({}));
      setStatus(d.error ?? "저장 실패");
    }
  }

  async function del(id: number, name: string) {
    if (!(await dialog.confirm({ message: `'${name}' 연결을 삭제할까요?`, danger: true, confirmText: "삭제" }))) return;
    await fetch(`/api/connections/${id}`, { method: "DELETE" });
    await load();
  }
  async function setMain(id: number) {
    await fetch(`/api/connections/${id}/activate`, { method: "POST" });
    await load();
  }

  async function loadModels() {
    if (!form.baseUrl.trim()) {
      setModelsMsg("Base URL을 먼저 입력하세요.");
      return;
    }
    setLoadingModels(true);
    setModelsMsg("");
    try {
      const res = await fetch("/api/connections/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey.trim() || undefined,
          connectionId: editing !== "new" ? editing : undefined,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setModels(d.models ?? []);
        setModelsMsg(`${(d.models ?? []).length}개${d.cached ? " · 캐시" : ""} · ${d.source ?? ""}`);
      } else {
        setModels([]);
        setModelsMsg(d.error ?? "불러오기 실패 — 직접 입력하세요");
      }
    } catch {
      setModelsMsg("네트워크 오류 — 직접 입력하세요");
    } finally {
      setLoadingModels(false);
    }
  }

  return (
    <section className="rounded-card bg-surface p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold">AI 연결</h2>
        {editing === null && (
          <button onClick={openNew} className="text-[11px] text-accent">
            + 연결 추가
          </button>
        )}
      </div>
      <p className="mb-4 text-[11px] opacity-50">
        OpenAI 호환. 여러 개 저장하고 메인을 골라 쓸 수 있어요(같은 공급사도 가능).
      </p>

      {/* 폼(추가/편집) */}
      {editing !== null && (
        <div className="mb-4 rounded-xl bg-surface-2 p-4 ring-1 ring-border">
          <label className="mb-1 block text-xs opacity-60">이름</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="예: 딥시크 프로 / OR 클로드"
            className={`${input} mb-3`}
          />

          <label className="mb-1 block text-xs opacity-60">공급사 프리셋</label>
          <div className="mb-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setForm((f) => ({ ...f, baseUrl: p.baseUrl }))}
                className={`rounded-control px-3 py-1.5 text-xs ${
                  form.baseUrl === p.baseUrl && (p.baseUrl !== "" || form.baseUrl === "")
                    ? "bg-accent text-black"
                    : "bg-bg ring-1 ring-border"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          <label className="mb-1 block text-xs opacity-60">Base URL</label>
          <input
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            placeholder="https://api.deepseek.com"
            className={`${input} mb-3`}
          />

          <label className="mb-1 block text-xs opacity-60">API 키</label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            autoComplete="off"
            placeholder={keyView.has ? `현재: ${keyView.masked} — 바꾸려면 새 키 입력` : "sk-... 입력"}
            className={`${input} mb-3`}
          />

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
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            placeholder="deepseek-chat / anthropic/claude-sonnet-4.6 …"
            className={input}
          />
          {modelsMsg && <p className="mt-1 text-[11px] opacity-50">{modelsMsg}</p>}
          {models.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-control ring-1 ring-border">
              <input
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder="검색…"
                className="w-full bg-bg px-3 py-1.5 text-xs outline-none"
              />
              <ul className="max-h-44 overflow-auto">
                {models
                  .filter((m) => m.id.toLowerCase().includes(modelQuery.toLowerCase()))
                  .slice(0, 80)
                  .map((m) => {
                    const meta = [ctxLabel(m.contextLength), priceLabel(m.pricePrompt)].filter(Boolean).join(" · ");
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, model: m.id }));
                            setModelQuery("");
                          }}
                          className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-2 ${
                            form.model === m.id ? "text-accent" : ""
                          }`}
                        >
                          <span className="truncate">{m.id}</span>
                          {meta && <span className="shrink-0 opacity-40">{meta}</span>}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}

          <label className="mb-1 mt-3 block text-xs opacity-60">임베딩 모델 (선택)</label>
          <input
            value={form.embeddingModel}
            onChange={(e) => setForm((f) => ({ ...f, embeddingModel: e.target.value }))}
            placeholder="text-embedding-3-small (비우면 기본값)"
            className={input}
          />

          {/* 비전(이미지 인식) 지원 토글 */}
          <label className="mt-3 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={form.supportsVision}
              onChange={(e) => setForm((f) => ({ ...f, supportsVision: e.target.checked }))}
              className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
            />
            <span className="text-xs">
              이미지 인식(비전) 지원
              <span className="mt-0.5 block text-[11px] opacity-50">
                켜면 일기 사진을 읽어 답장·주간 편지에 반영해요. DeepSeek 등 비전 미지원
                모델은 꺼두세요(사진은 무시됩니다).
              </span>
            </span>
          </label>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-control bg-accent px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="rounded-control px-4 py-2 text-sm opacity-60 ring-1 ring-border"
            >
              취소
            </button>
            {status && <span className="text-xs opacity-70">{status}</span>}
          </div>
        </div>
      )}

      {/* 연결 목록 */}
      {conns.length === 0 && editing === null ? (
        <p className="text-xs opacity-40">저장된 연결이 없어요. + 연결 추가로 만드세요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {conns.map((c) => (
            <li key={c.id} className="rounded-xl bg-bg p-3 text-xs ring-1 ring-border">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{c.name}</span>
                    {activeId === c.id && (
                      <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-black">
                        메인
                      </span>
                    )}
                    {c.supportsVision && (
                      <span
                        className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px]"
                        title="이미지 인식(비전) 지원"
                      >
                        👁 비전
                      </span>
                    )}
                  </div>
                  <p className="truncate opacity-50">
                    {host(c.baseUrl) || "Base URL 없음"} · {c.model || "모델 없음"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {activeId !== c.id && (
                    <button onClick={() => setMain(c.id)} className="rounded px-2 py-1 text-accent">
                      메인으로
                    </button>
                  )}
                  <button onClick={() => openEdit(c)} className="rounded px-2 py-1 opacity-70 hover:opacity-100">
                    편집
                  </button>
                  <button onClick={() => del(c.id, c.name)} className="rounded px-2 py-1 opacity-60 hover:text-red-400">
                    삭제
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 보조 모델 — 배경 작업(사진 캡션 등) 전용 */}
      {conns.length > 0 && editing === null && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="mb-1 text-sm font-semibold">보조 모델</h3>
          <p className="mb-2 text-[11px] opacity-50">
            사진 캡션 등 배경 작업에 쓰는 연결. 대화에는 안 나서요. 비전 지원 연결을 고르면
            사진 인식이 그 연결로 처리돼요.
          </p>
          <select
            value={auxId ?? ""}
            onChange={(e) => setAux(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent"
          >
            <option value="">없음 (비전 지원 연결 중 자동 선택)</option>
            {conns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.supportsVision ? " · 비전" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}
