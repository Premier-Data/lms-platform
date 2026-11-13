"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from "@/i18n/config";

type Props = {
  /** "light" for the white header, "dark" for the navy login screen */
  tone?: "light" | "dark";
};

const OPTIONS: { value: Locale; short: string }[] = [
  { value: "en", short: "EN" },
  { value: "vi", short: "VI" },
];

export function LanguageToggle({ tone = "light" }: Props) {
  const t = useTranslations("language");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function choose(next: Locale) {
    if (next === locale) return;

    // 1. Remember on this device.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;

    // 2. Remember on the account so it follows the user to other devices.
    //    (No-op when not signed in, e.g. on the login page.)
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await supabase.auth.updateUser({ data: { language: next } });
      }
    } catch {
      // Non-fatal: the cookie alone is enough for this device.
    }

    // 3. Re-render server + client components in the new language.
    startTransition(() => router.refresh());
  }

  const wrap =
    tone === "dark"
      ? "border-white/20 bg-white/5"
      : "border-slate-200 bg-white";
  const idle =
    tone === "dark"
      ? "text-slate-300 hover:text-white"
      : "text-slate-500 hover:text-slate-900";

  return (
    <div
      role="group"
      aria-label={t("label")}
      className={`inline-flex overflow-hidden rounded-lg border text-xs font-semibold ${wrap} ${
        pending ? "opacity-60" : ""
      }`}
    >
      {OPTIONS.map((o) => {
        const active = o.value === locale;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => choose(o.value)}
            aria-pressed={active}
            title={o.value === "en" ? t("english") : t("vietnamese")}
            className={`px-2.5 py-1.5 transition ${
              active ? "bg-pd-red text-white" : idle
            }`}
          >
            {o.short}
          </button>
        );
      })}
    </div>
  );
}
