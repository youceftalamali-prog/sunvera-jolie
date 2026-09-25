"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/* --------------------------------- Toasts -------------------------------- */

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
type ToastCtx = { push: (kind: Toast["kind"], text: string) => void };

const Ctx = createContext<ToastCtx>({ push: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 end-4 z-[200] flex w-72 flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto border p-3 text-[12px] shadow-lg ${
              t.kind === "success"
                ? "border-green-300 bg-green-50 text-green-800"
                : t.kind === "error"
                  ? "border-red-300 bg-red-50 text-red-800"
                  : "border-[var(--svj-border)] bg-white text-[var(--svj-text)]"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/* --------------------------------- Modal --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] overflow-y-auto bg-black/50 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`mx-auto my-8 bg-white shadow-xl ${wide ? "max-w-5xl" : "max-w-2xl"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--svj-border)] px-4 py-3">
          <h3 className="font-display text-lg">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="px-2 text-[var(--svj-muted)] hover:text-[var(--svj-text)]">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* --------------------------------- Drawer -------------------------------- */

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] bg-black/40" onClick={onClose}>
      <aside
        className="absolute inset-y-0 end-0 flex w-full max-w-md flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-[var(--svj-border)] px-4 py-3">
          <h3 className="font-display text-lg">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="px-2 text-[var(--svj-muted)] hover:text-[var(--svj-text)]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}

/* ----------------------------- Confirm dialog ---------------------------- */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-sm bg-white p-5 shadow-xl">
        <h3 className="font-display text-lg">{title}</h3>
        <p className="mt-2 text-[12px] text-[var(--svj-muted)]">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-outline !py-2">Cancel</button>
          <button onClick={onConfirm} className={danger ? "border border-red-300 bg-red-600 px-4 py-2 text-[12px] text-white" : "btn-primary !py-2"}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ States ---------------------------------- */

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-[var(--svj-border)] bg-white p-10 text-center">
      <p className="font-display text-lg">{title}</p>
      {hint && <p className="mt-1 text-[12px] text-[var(--svj-muted)]">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="py-8 text-center text-[12px] text-[var(--svj-muted)]" role="status">
      <span className="me-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--svj-border)] border-t-[var(--svj-primary)] align-middle" />
      {label}
    </p>
  );
}

/* --------------------------- Save-state helper --------------------------- */

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useSaveState() {
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useCallback(async (fn: () => Promise<void>, okText = "Saved successfully") => {
    setState("saving");
    setMessage("");
    try {
      await fn();
      setState("saved");
      setMessage(okText);
    } catch (e) {
      setState("error");
      setMessage((e as Error).message || "Something went wrong");
    } finally {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 3000);
    }
  }, []);
  return { state, message, run };
}

export function SaveIndicator({ state, message }: { state: SaveState; message: string }) {
  if (state === "idle") return null;
  if (state === "saving") return <span className="text-[11px] text-[var(--svj-muted)]">Saving…</span>;
  if (state === "saved") return <span className="text-[11px] text-green-700">✓ {message || "Saved"}</span>;
  return <span className="text-[11px] text-red-700"> {message || "Error — retry"}</span>;
}
