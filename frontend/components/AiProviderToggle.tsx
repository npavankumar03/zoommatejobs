"use client";

import { Bot, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

type AiProviderToggleProps = {
  value: "OPENAI" | "GEMINI";
  onChange: (value: "OPENAI" | "GEMINI") => void;
};

export function AiProviderToggle({ value, onChange }: AiProviderToggleProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onChange("OPENAI")}
        className={cn(
          "rounded-xl border p-4 text-left transition",
          value === "OPENAI"
            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
            : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900"
        )}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <p className="font-semibold">OpenAI</p>
        </div>
        <p className="mt-1 text-xs text-slate-500">Primary high-accuracy model</p>
      </button>

      <button
        type="button"
        onClick={() => onChange("GEMINI")}
        className={cn(
          "rounded-xl border p-4 text-left transition",
          value === "GEMINI"
            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
            : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900"
        )}
      >
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <p className="font-semibold">Gemini</p>
        </div>
        <p className="mt-1 text-xs text-slate-500">Secondary fast model option</p>
      </button>
    </div>
  );
}
