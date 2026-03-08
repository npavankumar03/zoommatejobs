"use client";

import { CheckCircle2, Info, XCircle } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

type Toast = {
  id: number;
  title: string;
  type: ToastType;
};

type ToastContextValue = {
  pushToast: (title: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((title: string, type: ToastType = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, title, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2400);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  useEffect(() => {
    const onAccessDenied = () => {
      pushToast("Access denied", "error");
    };

    const onToast = (event: Event) => {
      const custom = event as CustomEvent<{ title?: string; type?: ToastType }>;
      const title = custom.detail?.title;
      const type = custom.detail?.type ?? "info";
      if (title) {
        pushToast(title, type);
      }
    };

    window.addEventListener("jobfill:access-denied", onAccessDenied);
    window.addEventListener("jobfill:toast", onToast as EventListener);
    return () => {
      window.removeEventListener("jobfill:access-denied", onAccessDenied);
      window.removeEventListener("jobfill:toast", onToast as EventListener);
    };
  }, [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "rounded-lg border px-4 py-3 text-sm shadow-lg",
              toast.type === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
              toast.type === "error" && "border-rose-200 bg-rose-50 text-rose-900",
              toast.type === "info" && "border-slate-200 bg-white text-slate-900"
            )}
          >
            <div className="flex items-center gap-2">
              {toast.type === "success" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : toast.type === "error" ? (
                <XCircle className="h-4 w-4" />
              ) : (
                <Info className="h-4 w-4" />
              )}
              <span>{toast.title}</span>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
