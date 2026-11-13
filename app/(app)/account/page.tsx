"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Loader2, User, Lock, LogOut } from "lucide-react";

export default function AccountPage() {
  const t = useTranslations("account");
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setEmail(user.email ?? "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      if (profile) {
        setFullName(profile.full_name ?? "");
      }

      setLoading(false);
    }

    loadProfile();
  }, [supabase]);

  async function handleUpdateProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setProfileMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setProfileMessage(t("notSignedIn"));
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", user.id);

    if (error) {
      setProfileMessage(error.message);
    } else {
      setProfileMessage(t("profileUpdated"));
      router.refresh();
    }

    setSaving(false);
  }

  async function handleChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordMessage("");

    if (newPassword !== confirmPassword) {
      setPasswordMessage(t("passwordMismatch"));
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage(t("passwordTooShort"));
      return;
    }

    setChangingPassword(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setPasswordMessage(error.message);
    } else {
      setPasswordMessage(t("passwordUpdated"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }

    setChangingPassword(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {t("title")}
        </h1>

        <div className="mt-3 h-1 w-12 rounded-full bg-pd-red" />

        <p className="mt-4 text-slate-500">
          {t("subtitle")}
        </p>
      </div>

      {/* Profile section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-pd-red/10 p-2.5 text-pd-red">
            <User size={20} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            {t("profile")}
          </h2>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("email")}
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500"
            />
            <p className="mt-1 text-xs text-slate-400">
              {t("emailLocked")}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("fullName")}
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
              placeholder={t("fullNamePlaceholder")}
            />
          </div>

          {profileMessage && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {profileMessage}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:opacity-50"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? t("saving") : t("saveChanges")}
            </button>
          </div>
        </form>
      </section>

      {/* Change password section */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-pd-red/10 p-2.5 text-pd-red">
            <Lock size={20} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            {t("changePassword")}
          </h2>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("newPassword")}
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("confirmPassword")}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
              placeholder="••••••••"
            />
          </div>

          {passwordMessage && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {passwordMessage}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={changingPassword}
              className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:opacity-50"
            >
              {changingPassword && (
                <Loader2 size={16} className="animate-spin" />
              )}
              {changingPassword ? t("updating") : t("updatePassword")}
            </button>
          </div>
        </form>
      </section>

      {/* Sign out section */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">
              {t("signOut")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("signOutHint")}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <LogOut size={16} />
            {t("signOut")}
          </button>
        </div>
      </section>
    </div>
  );
}
