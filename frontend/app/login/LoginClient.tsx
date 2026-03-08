"use client";

import { useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { fetchPublicSettings, useApiQuery } from "@/lib/api";

type PublicSettings = {
  maintenanceMode: boolean;
  allowRegistration: boolean;
  siteName: string;
  siteTagline: string;
};

const DEFAULT_SETTINGS: PublicSettings = {
  maintenanceMode: false,
  allowRegistration: true,
  siteName: "zoommate",
  siteTagline: "Your AI-powered job application copilot"
};

function getErrorMessage(error: string | null): string | null {
  if (!error) return null;

  if (error === "RegistrationDisabled") {
    return "Registration is currently disabled by the administrator.";
  }

  if (error === "AccountBanned") {
    return "Your account has been disabled. Contact support for help.";
  }

  if (error === "AccountConflict") {
    return "We could not safely link this Google account. Contact support.";
  }

  if (error === "OAuthMissingProfile") {
    return "Google did not return a valid profile. Please try again.";
  }

  return "Authentication failed. Please try again.";
}

type LoginClientProps = {
  callbackUrl: string;
  error: string | null;
};

export function LoginClient({ callbackUrl, error }: LoginClientProps) {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const settingsQuery = useApiQuery(
    ["public-settings"],
    fetchPublicSettings,
    {
      staleTime: 30_000,
      refetchInterval: 60_000,
      retry: 1,
    }
  );
  const settings = settingsQuery.data ?? DEFAULT_SETTINGS;
  const isLoading = settingsQuery.isLoading;

  const errorMessage = useMemo(() => getErrorMessage(error), [error]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    await signIn("google", { callbackUrl });
    setIsSigningIn(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-xl font-bold text-white">
            ZM
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{settings.siteName}</h1>
          <p className="mt-2 text-sm text-slate-600">{settings.siteTagline}</p>
        </div>

        {isLoading ? (
          <p className="text-center text-sm text-slate-500">Loading settings...</p>
        ) : settings.maintenanceMode ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Maintenance mode is enabled. Sign in is temporarily unavailable.
          </div>
        ) : !settings.allowRegistration ? (
          <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
            Registration closed. New signups are currently disabled.
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                fill="#EA4335"
                d="M24 9.5c3.7 0 7 1.3 9.6 3.8l7.2-7.2C36.4 2.1 30.6 0 24 0 14.6 0 6.5 5.4 2.6 13.3l8.4 6.5C13.1 13.7 18.1 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.6h12.7c-.5 2.8-2.1 5.2-4.4 6.9l7 5.4c4.1-3.8 7.2-9.3 7.2-16.4z"
              />
              <path
                fill="#FBBC05"
                d="M11 28.3c-.5-1.4-.8-2.8-.8-4.3s.3-2.9.8-4.3l-8.4-6.5C.9 16.7 0 20.2 0 24s.9 7.3 2.6 10.8l8.4-6.5z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.6 0 12.1-2.2 16.1-6l-7-5.4c-2 1.3-4.6 2.1-9.1 2.1-5.9 0-10.9-4.2-12.7-9.8l-8.4 6.5C6.5 42.6 14.6 48 24 48z"
              />
            </svg>
            {isSigningIn ? "Connecting..." : "Continue with Google"}
          </button>
        )}

        {errorMessage ? (
          <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}
      </section>
    </main>
  );
}
