"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Kind = "alert" | "confirm" | "prompt";

interface BaseOpts {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
}
interface ConfirmOpts extends BaseOpts {
  danger?: boolean;
}
interface PromptOpts extends BaseOpts {
  defaultValue?: string;
  placeholder?: string;
}

interface DialogApi {
  alert(o: BaseOpts | string): Promise<void>;
  confirm(o: ConfirmOpts | string): Promise<boolean>;
  prompt(o: PromptOpts | string): Promise<string | null>;
}

interface DialogReq extends ConfirmOpts, PromptOpts {
  kind: Kind;
  resolve: (v: unknown) => void;
}

const Ctx = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDialog must be used within <DialogProvider>");
  return c;
}

const norm = (o: string | object): object => (typeof o === "string" ? { message: o } : o);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<DialogReq | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const open = useCallback(
    (r: Omit<DialogReq, "resolve">) =>
      new Promise<unknown>((resolve) => {
        setValue(r.defaultValue ?? "");
        setReq({ ...r, resolve });
      }),
    [],
  );

  const apiRef = useRef<DialogApi>({
    alert: (o) => open({ kind: "alert", ...norm(o) }).then(() => undefined),
    confirm: (o) => open({ kind: "confirm", ...norm(o) }).then((v) => v === true),
    prompt: (o) => open({ kind: "prompt", ...norm(o) }).then((v) => (v == null ? null : String(v))),
  });

  const finish = useCallback(
    (v: unknown) => {
      req?.resolve(v);
      setReq(null);
    },
    [req],
  );

  // 확인/취소 기본값
  const onConfirm = () => finish(req?.kind === "prompt" ? value : true);
  const onCancel = () => finish(req?.kind === "alert" ? undefined : req?.kind === "prompt" ? null : false);

  useEffect(() => {
    if (!req) return;
    if (req.kind === "prompt") inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter" && req?.kind !== "prompt") {
        e.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req, value]);

  return (
    <Ctx.Provider value={apiRef.current}>
      {children}
      {req && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={onCancel}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-xs rounded-card bg-surface p-5 ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            {req.title && <h2 className="font-display mb-1.5 text-sm font-semibold">{req.title}</h2>}
            {req.message && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed opacity-80">{req.message}</p>
            )}
            {req.kind === "prompt" && (
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onConfirm();
                  }
                }}
                placeholder={req.placeholder}
                className="mt-3 w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent"
              />
            )}
            <div className="mt-4 flex justify-end gap-2">
              {req.kind !== "alert" && (
                <button
                  onClick={onCancel}
                  className="rounded-control px-4 py-2 text-sm opacity-60 ring-1 ring-border"
                >
                  {req.cancelText ?? "취소"}
                </button>
              )}
              <button
                onClick={onConfirm}
                className={`rounded-control px-4 py-2 text-sm font-medium ${
                  req.danger ? "bg-red-500 text-white" : "bg-accent text-black"
                }`}
              >
                {req.confirmText ?? (req.kind === "alert" ? "확인" : req.kind === "prompt" ? "확인" : "확인")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
