"use client";

import { SessionProvider } from "next-auth/react";

import { AppRuntimeBridge } from "@/components/AppRuntimeBridge";
import { QueryProvider } from "@/components/QueryProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";

type AuthProviderProps = {
  children: React.ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <SessionProvider>
      <QueryProvider>
        <ThemeProvider>
          <ToastProvider>
            <AppRuntimeBridge />
            {children}
          </ToastProvider>
        </ThemeProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
