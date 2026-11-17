"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Check, Loader2, Search, X } from "lucide-react";

type DirectoryUser = { id: string; email: string; full_name: string };

type Recipient = {
  user_id: string;
  status: "not_started" | "in_progress" | "completed";
  progress?: string;
  due_date?: string | null;
};

type Template = "new_course" | "reminder" | "due_soon" | "custom";

const STATUS_LABEL: Record<Recipient["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};
const STATUS_STYLE: Record<Recipient["status"], string> = {
  not_started: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
};

/**
 * E-mail the learners assigned to a course or learning path (assignment
 * e-mail, reminder, due soon, or a custom message). Only assigned learners
 * are listed.
 */
export function NotifyModal({
  kind,
  id,
  title,
  users,
  onClose,
}: {
  kind: "course" | "path";
  id: string;
  title: string;
  users: DirectoryUser[];
  onClose: () => void;
}) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [template, setTemplate] = useState<Template>("reminder");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [customSubject, setCustomSubject] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const qs = kind === "path" ? `path_id=${id}` : `course_id=${id}`;
    fetch(`/api/admin/notify?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: Recipient[] = d?.recipients ?? [];
        setRecipients(list);
        setEmailConfigured(d?.email_configured !== false);
        // Default: everyone who hasn't finished yet.
        setSelected(
          new Set(list.filter((r) => r.status !== "completed").map((r) => r.user_id))
        );
      })
      .finally(() => setLoading(false));
  }, [kind, id]);

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return recipients
      .map((r) => ({ ...r, user: byId.get(r.user_id) }))
      .filter(
        (r) =>
          !s ||
          (r.user?.full_name ?? "").toLowerCase().includes(s) ||
          (r.user?.email ?? "").toLowerCase().includes(s)
      )
      .sort((a, b) =>
        (a.user?.full_name || a.user?.email || "~").localeCompare(
          b.user?.full_name || b.user?.email || "~"
        )
      );
  }, [recipients, byId, search]);

  function selectWhere(pred: (r: Recipient) => boolean) {
    setSelected(new Set(recipients.filter(pred).map((r) => r.user_id)));
  }

  function toggle(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function send() {
    if (selected.size === 0) return;
    setSending(true);
    setMessage("");
    setIsError(false);
    const res = await fetch("/api/admin/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_ids: Array.from(selected),
        template,
        ...(kind === "path" ? { path_id: id } : { course_id: id }),
        custom_subject: customSubject,
        custom_message: customMessage,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setIsError(true);
      setMessage(d.error || "Failed to send.");
      return;
    }
    const parts = [`${d.sent} e-mail${d.sent === 1 ? "" : "s"} sent`];
    if (d.failed > 0) parts.push(`${d.failed} failed`);
    if (d.error) parts.push(d.error);
    setIsError(d.failed > 0);
    setMessage(parts.join(" · ") + ".");
    if (!d.failed) setTimeout(onClose, 1800);
  }

  const noun = kind === "path" ? "learning path" : "course";
  const customInvalid = template === "custom" && !customMessage.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Notify learners</h2>
            <p className="mt-1 text-sm text-slate-500">{title}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 border-b border-slate-200 p-6">
          {!emailConfigured && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              E-mail isn&apos;t set up (RESEND_API_KEY missing), so nothing can be sent.
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700">E-mail</label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as Template)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pd-red"
            >
              <option value="new_course">You&apos;ve been assigned this {noun}</option>
              <option value="reminder">Reminder to finish the {noun}</option>
              {kind === "course" && <option value="due_soon">Course due soon</option>}
              <option value="custom">Custom message</option>
            </select>
          </div>

          {template === "custom" && (
            <div className="space-y-3">
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="Subject"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pd-red"
              />
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Your message..."
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pd-red"
              />
            </div>
          )}

          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assigned learners..."
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-pd-red"
            />
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="py-1 text-slate-400">Select:</span>
            {[
              ["All", () => selectWhere(() => true)],
              ["Not completed", () => selectWhere((r) => r.status !== "completed")],
              ["Not started", () => selectWhere((r) => r.status === "not_started")],
              ["None", () => setSelected(new Set())],
            ].map(([label, fn]) => (
              <button
                key={label as string}
                type="button"
                onClick={fn as () => void}
                className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600 transition hover:bg-slate-200"
              >
                {label as string}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-slate-400" size={22} />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {recipients.length === 0
                ? `No one is assigned to this ${noun} yet.`
                : "No learners match your search."}
            </p>
          ) : (
            rows.map((r) => {
              const on = selected.has(r.user_id);
              return (
                <button
                  key={r.user_id}
                  type="button"
                  onClick={() => toggle(r.user_id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                    on ? "bg-pd-red/5" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {r.user?.full_name || r.user?.email || "Unknown user"}
                    </p>
                    <p className="truncate text-xs text-slate-500">{r.user?.email ?? r.user_id}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                    {r.progress ? ` · ${r.progress}` : ""}
                  </span>
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                      on ? "border-pd-red bg-pd-red text-white" : "border-slate-300"
                    }`}
                  >
                    {on && <Check size={14} />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-slate-200 p-6">
          {message && (
            <div
              className={`mb-4 rounded-xl px-4 py-3 text-sm ${
                isError ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-700"
              }`}
            >
              {message}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              {selected.size} of {recipients.length} selected
            </span>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={send}
                disabled={sending || selected.size === 0 || customInvalid || !emailConfigured}
                className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
                {sending ? "Sending..." : `Send to ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
