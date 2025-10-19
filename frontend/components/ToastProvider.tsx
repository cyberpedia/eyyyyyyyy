"use client";

import React, { createContext, useContext, useRef, useState } from "react";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; type: ToastType; message: string };

type ToastContextValue = {
  notify: (type: ToastType, message: string) => void;
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = (id: number) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
    setToasts((ts) => ts.filter((t) => t.id !== id));
  };

  const notify = (type: ToastType, message: string) => {
    const id = ++idRef.current;
    setToasts((ts) => [...ts, { id, type, message }]);
    const timeoutId = setTimeout(() => {
      setToasts((ts) => ts.filter((t) => t.id !== id));
      timeoutsRef.current.delete(id);
    }, 4000);
    timeoutsRef.current.set(id, timeoutId);
  };

  const value: ToastContextValue = {
    notify,
    notifySuccess: (m) => notify("success", m),
    notifyError: (m) => notify("error", m),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2 rounded shadow text-white flex items-center gap-3 ${
              t.type === "success"
                ? "bg-green-600"
                : t.type === "error"
                ? "bg-red-600"
                : "bg-gray-700"
            }`}
          >
            <span>{t.message}</span>
            <button
              aria-label="Dismiss"
              className="ml-auto px-2 py-1 rounded bg-black/20 hover:bg-black/30"
              onClick={() => removeToast(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}