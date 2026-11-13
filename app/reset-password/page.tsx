"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { LanguageToggle } from "@/components/language-toggle";

export default function ResetPasswordPage() {
  const t = useTranslations("resetPassword");
  const ta = useTranslations("auth");
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  // The user arrives here only after /auth/callback established a recovery
  // session. If there's no session, the link was invalid or expired.
  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage(t("invalidLink"));
      }
      setCheckingSession(false);
    }

    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (password !== confirmPassword) {
      setMessage(t("mismatch"));
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      // Updates the password for the currently authenticated (recovery) user
      // and clears the forced-reset flag so they aren't redirected again.
      const { error } = await supabase.auth.updateUser({
        password,
        data: { must_reset_password: false },
      });

      if (error) throw error;

      setDone(true);
      setMessage(t("updated"));

      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1500);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ta("genericError")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-pd-navy-deep p-6">
      <div className="absolute right-4 top-4">
        <LanguageToggle tone="dark" />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-pd-navy p-8 shadow-2xl shadow-black/40">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            {t("title")}
          </h1>

          <div className="mt-3 h-1 w-12 rounded-full bg-pd-red" />

          <p className="mt-4 text-sm text-slate-300">
            {t("subtitle")}
          </p>
        </div>

        {checkingSession ? (
          <p className="text-sm text-slate-300">{t("verifying")}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                {t("newPassword")}
              </label>

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={done}
                className="w-full rounded-lg border border-white/15 bg-pd-navy-surface px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-pd-red disabled:opacity-60"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                {t("confirmPassword")}
              </label>

              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                disabled={done}
                className="w-full rounded-lg border border-white/15 bg-pd-navy-surface px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-pd-red disabled:opacity-60"
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
              disabled={loading || done}
              className="w-full rounded-lg bg-pd-red px-4 py-3 font-semibold text-white transition hover:bg-pd-red-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? t("updating") : t("update")}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
