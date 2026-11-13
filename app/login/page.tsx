"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { LanguageToggle } from "@/components/language-toggle";

export default function LoginPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [signupComplete, setSignupComplete] = useState(false);
  // Start in a "checking" state so we don't flash the login form before we
  // know whether the user already has a session.
  const [checkingAuth, setCheckingAuth] = useState(true);

  // If already authenticated (e.g. PWA cold launch with a persisted session),
  // skip the login screen and go straight to the dashboard.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/dashboard");
      } else {
        setCheckingAuth(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (error) throw error;

        setSignupComplete(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        router.push("/dashboard");
        router.refresh();
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("genericError")
      );
    } finally {
      setLoading(false);
    }
  }

  // While checking for an existing session, show a branded loading screen
  // instead of flashing the login form (prevents the "login flash on reload").
  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-pd-navy-deep p-6">
        <div className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon.png"
            alt="Premier Data"
            className="h-16 w-16 animate-pulse rounded-2xl"
          />
          <p className="text-sm text-slate-400">{tc("loading")}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-pd-navy-deep p-6">
      <div className="absolute right-4 top-4"><LanguageToggle tone="dark" /></div>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-pd-navy p-8 shadow-2xl shadow-black/40">
        {signupComplete ? (
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pd-red/15">
              <svg
                className="h-7 w-7 text-pd-red"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                />
              </svg>
            </div>

            <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-white">
              {t("checkEmail")}
            </h1>

            <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-pd-red" />

            <p className="mt-4 text-sm text-slate-300">
              {t.rich("confirmationSent", { email, b: (chunks) => <span className="font-semibold text-white">{chunks}</span> })}
            </p>

            <button
              type="button"
              onClick={() => {
                setSignupComplete(false);
                setIsSignUp(false);
                setPassword("");
                setMessage("");
              }}
              className="mt-6 w-full rounded-lg bg-pd-red px-4 py-3 font-semibold text-white transition hover:bg-pd-red-hover"
            >
              {t("backToSignIn")}
            </button>
          </div>
        ) : (
        <>
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            PREMIER<span className="text-pd-red">DATA</span>
          </h1>

          <div className="mt-3 h-1 w-12 rounded-full bg-pd-red" />

          <p className="mt-4 text-sm text-slate-300">
            {isSignUp ? t("subtitleSignUp") : t("subtitleSignIn")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {isSignUp && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                {t("fullName")}
              </label>

              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full rounded-lg border border-white/15 bg-pd-navy-surface px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-pd-red"
                placeholder={t("fullNamePlaceholder")}
              />
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">
              {t("email")}
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-white/15 bg-pd-navy-surface px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-pd-red"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-200">
                {t("password")}
              </label>

              {!isSignUp && (
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-pd-red hover:text-pd-red-hover"
                >
                  {t("forgotPassword")}
                </Link>
              )}
            </div>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-white/15 bg-pd-navy-surface px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-pd-red"
              placeholder="••••••••"
            />
          </div>

          {message && (
            <div className="rounded-lg border border-white/10 bg-pd-navy-surface p-3 text-sm text-slate-200">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-pd-red px-4 py-3 font-semibold text-white transition hover:bg-pd-red-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t("pleaseWait") : isSignUp ? t("createAccount") : t("signIn")}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400">
          {isSignUp ? t("haveAccount") : t("noAccount")}

          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setMessage("");
            }}
            className="ml-2 font-semibold text-pd-red hover:text-pd-red-hover"
          >
            {isSignUp ? t("signIn") : t("createOne")}
          </button>
        </div>
        </>
        )}
      </div>
    </main>
  );
}