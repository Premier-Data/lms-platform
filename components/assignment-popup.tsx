"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { BookOpen, ChevronRight, Route, X, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { NewAssignment } from "@/lib/new-assignments";

const SEEN_KEY = "assignments_seen_at";

/** "You've been assigned …" pop-up shown once per new assignment. */
export function AssignmentPopup({ items }: { items: NewAssignment[] }) {
  const t = useTranslations("assignedPopup");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(items.length > 0);

  if (!open || items.length === 0) return null;

  async function markSeen() {
    try {
      const supabase = createClient();
      await supabase.auth.updateUser({
        data: { [SEEN_KEY]: new Date().toISOString() },
      });
    } catch {
      // Non-fatal: worst case the pop-up shows again next time.
    }
  }

  function dismiss() {
    setOpen(false);
    void markSeen();
  }

  async function go(href: string) {
    setOpen(false);
    await markSeen();
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="relative bg-pd-navy px-6 py-5">
          <button
            onClick={dismiss}
            aria-label={t("close")}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pd-red">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {items.length === 1 ? t("titleOne") : t("titleMany", { n: items.length })}
              </h2>
              <p className="text-xs text-slate-300">{t("subtitle")}</p>
            </div>
          </div>
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto p-4">
          {items.map((it) => (
            <button
              key={`${it.kind}-${it.id}`}
              onClick={() => go(it.href)}
              className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-pd-red hover:bg-pd-red/5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pd-red/10 text-pd-red">
                {it.kind === "path" ? <Route size={18} /> : <BookOpen size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {it.kind === "path" ? t("learningPath") : t("course")}
                </p>
                <p className="truncate font-semibold text-slate-900">{it.title}</p>
                <p className="text-xs text-slate-500">
                  {it.kind === "path"
                    ? t("pathCourses", { n: it.courseCount ?? 0 })
                    : it.dueDate
                      ? t("due", {
                          date: new Date(it.dueDate).toLocaleDateString(locale),
                        })
                      : t("start")}
                </p>
              </div>
              <ChevronRight
                size={18}
                className="shrink-0 text-slate-300 transition group-hover:text-pd-red"
              />
            </button>
          ))}
        </div>

        <div className="flex justify-end border-t border-slate-200 px-4 py-3">
          <button
            onClick={dismiss}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            {t("later")}
          </button>
        </div>
      </div>
    </div>
  );
}
