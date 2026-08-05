"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import clsx from "clsx";

type ToastType = "success" | "error" | "info" | "pending";
interface Toast {
  id: number;
  type: ToastType;
  message: ReactNode;
  position: "top" | "bottom" | "top-right";
}
interface ToastApi {
  toast: (t: {
    type?: ToastType;
    message: ReactNode;
    duration?: number;
    position?: "top" | "bottom" | "top-right";
  }) => number;
  update: (id: number, t: { type?: ToastType; message: ReactNode }) => void;
  dismiss: (id: number) => void;
}

const ToastCtx = createContext<ToastApi>({
  toast: () => 0,
  update: () => {},
  dismiss: () => {},
});

export function useToast() {
  return useContext(ToastCtx);
}

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastApi["toast"]>(
    ({ type = "info", message, duration = 4500, position = "bottom" }) => {
      const id = ++counter;
      setToasts((prev) => [...prev, { id, type, message, position }]);
      if (duration > 0 && type !== "pending") {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  const update = useCallback<ToastApi["update"]>((id, t) => {
    setToasts((prev) =>
      prev.map((x) => (x.id === id ? { ...x, ...t } : x))
    );
    if (t.type && t.type !== "pending") {
      setTimeout(() => dismiss(id), 4500);
    }
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={{ toast, update, dismiss }}>
      {children}
      <ToastViewport
        toasts={toasts.filter((t) => t.position === "top")}
        onDismiss={dismiss}
        position="top"
      />
      <ToastViewport
        toasts={toasts.filter((t) => t.position === "top-right")}
        onDismiss={dismiss}
        position="top-right"
      />
      <ToastViewport
        toasts={toasts.filter((t) => t.position === "bottom")}
        onDismiss={dismiss}
        position="bottom"
      />
    </ToastCtx.Provider>
  );
}

const ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  pending: "◌",
};

export function ToastViewport({
  toasts,
  onDismiss,
  position = "bottom",
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
  position?: "top" | "bottom" | "top-right";
}) {
  const posClass =
    position === "top"
      ? "top-20 left-1/2 -translate-x-1/2"
      : position === "top-right"
        ? "top-20 right-4 left-auto translate-x-0"
        : "bottom-5 left-1/2 -translate-x-1/2";
  const alignClass = position === "top-right" ? "items-end ml-auto" : "items-center mx-auto";
  return (
    <div className={`pointer-events-none fixed z-[70] flex w-full max-w-sm flex-col gap-2 px-4 ${posClass} ${alignClass}`}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className="glass pointer-events-auto flex animate-fade-up items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-card"
        >
          <span
            className={clsx(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              t.type === "success" && "bg-emerald-500/20 text-emerald-400",
              t.type === "error" && "bg-red-500/20 text-red-400",
              t.type === "info" && "bg-accent/20 text-accent-soft",
              t.type === "pending" && "bg-amber-500/20 text-amber-400"
            )}
          >
            {t.type === "pending" ? (
              <span className="animate-spin-slow">{ICONS.pending}</span>
            ) : (
              ICONS[t.type]
            )}
          </span>
          <span className="flex-1 break-words text-[var(--text)]">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
