"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2,
  Send,
  Plus,
  X,
  Search,
  Paperclip,
  Users,
  MessageSquare,
  ArrowLeft,
  FileText,
  Check,
} from "lucide-react";

type Conversation = {
  id: string;
  type: string;
  title: string | null;
  displayName: string;
  members: { user_id: string; name: string }[];
  lastMessage: {
    content: string | null;
    attachment_name: string | null;
    created_at: string;
  } | null;
  unread: number;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  created_at: string;
  sender_name?: string;
  is_mine?: boolean;
};

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
};

export default function MessagesPage() {
  const t = useTranslations("messages");
  const locale = useLocale();
  const supabase = createClient();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);

  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // New conversation modals
  const [showNewDirect, setShowNewDirect] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembers, setGroupMembers] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const activeConversation = conversations.find((c) => c.id === activeId);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations ?? []);
    }
  }, []);

  // Initial load
  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);

      // Admins get the full user directory (200); learners get 403.
      const usersRes = await fetch("/api/admin/users");
      if (usersRes.ok) {
        const data = await usersRes.json();
        setAllUsers(data.users ?? []);
        setIsAdmin(true);
      } else {
        // Learner: load the list of admins they can message
        const adminsRes = await fetch("/api/admins");
        if (adminsRes.ok) {
          const data = await adminsRes.json();
          setAllUsers(data.admins ?? []);
        }
        setIsAdmin(false);
      }

      await loadConversations();
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load a conversation's messages
  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setLoadingThread(true);
    const res = await fetch(`/api/conversations/${id}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
    }
    setLoadingThread(false);
    // Clear unread on this conversation locally
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c))
    );
  }, []);

  // Realtime subscription for the active conversation
  useEffect(() => {
    if (!activeId) return;

    const channel = supabase
      .channel(`messages:${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            // Avoid duplicating our own just-sent message
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [
              ...prev,
              { ...newMsg, is_mine: newMsg.sender_id === currentUserId },
            ];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId, currentUserId, supabase]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(
    attachment?: {
      url: string;
      name: string;
      type: string;
    }
  ) {
    if (!activeId) return;
    if (!composer.trim() && !attachment) return;

    setSending(true);
    const res = await fetch(`/api/conversations/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: composer,
        attachment_url: attachment?.url,
        attachment_name: attachment?.name,
        attachment_type: attachment?.type,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      // Optimistically add (realtime will dedupe)
      setMessages((prev) =>
        prev.some((m) => m.id === data.message.id)
          ? prev
          : [...prev, { ...data.message, is_mine: true }]
      );
      setComposer("");
      loadConversations();
    }
    setSending(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;

    setUploading(true);
    try {
      const presignRes = await fetch("/api/upload-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign.error);

      await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      const type = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "document";

      // Record the file for storage tracking (best-effort; ignored for
      // non-admins since the endpoint is admin-only)
      fetch("/api/admin/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: file.name,
          file_url: presign.publicUrl,
          r2_key: presign.key,
          file_type: type,
          size_bytes: file.size,
        }),
      }).catch(() => {});

      await sendMessage({ url: presign.publicUrl, name: file.name, type });
    } catch {
      // silently ignore for now
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function createDirect(targetUserId: string) {
    setCreating(true);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "direct", target_user_id: targetUserId }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) {
      setShowNewDirect(false);
      await loadConversations();
      openConversation(data.conversation_id);
    }
  }

  async function createGroup() {
    if (!groupTitle.trim() || groupMembers.size === 0) return;
    setCreating(true);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "group",
        title: groupTitle,
        member_ids: Array.from(groupMembers),
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) {
      setShowNewGroup(false);
      setGroupTitle("");
      setGroupMembers(new Set());
      await loadConversations();
      openConversation(data.conversation_id);
    }
  }

  // Directory to pick from. Admins: full user list. Learners: admins only
  // (allUsers already holds just admins for learners).
  const directoryUsers = allUsers;

  const filteredDirectory = directoryUsers.filter(
    (u) =>
      u.id !== currentUserId &&
      (u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase()))
  );

  function timeLabel(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {t("title")}
        </h1>
        <div className="mt-3 h-1 w-12 rounded-full bg-pd-red" />
      </div>

      <div className="grid h-[calc(100vh-16rem)] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[300px_1fr]">
        {/* Conversation list */}
        <div
          className={`flex flex-col border-r border-slate-200 ${
            activeId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-900">
              {t("chats")}
            </h2>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  setShowNewDirect(true);
                  setUserSearch("");
                }}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                title={t("newMessage")}
              >
                <Plus size={18} />
              </button>
              {isAdmin && (
                <button
                  onClick={() => {
                    setShowNewGroup(true);
                    setUserSearch("");
                    setGroupTitle("");
                    setGroupMembers(new Set());
                  }}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  title={t("newGroup")}
                >
                  <Users size={18} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-400">
                {t("noConversations")}
                <br />
                {t("startOne")}
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => openConversation(conv.id)}
                  className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${
                    activeId === conv.id ? "bg-pd-red/5" : ""
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      conv.type === "group"
                        ? "bg-pd-navy text-white"
                        : "bg-pd-red text-white"
                    }`}
                  >
                    {conv.type === "group" ? (
                      <Users size={18} />
                    ) : (
                      conv.displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {conv.displayName}
                      </p>
                      {conv.unread > 0 && (
                        <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-pd-red px-1 text-[11px] font-bold text-white">
                          {conv.unread}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {conv.lastMessage
                        ? conv.lastMessage.content ||
                          (conv.lastMessage.attachment_name
                            ? `📎 ${conv.lastMessage.attachment_name}`
                            : "")
                        : t("noMessagesYet")}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Message thread */}
        <div
          className={`min-h-0 flex-col ${activeId ? "flex" : "hidden md:flex"}`}
        >
          {!activeConversation ? (
            <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
              <MessageSquare size={40} />
              <p className="mt-3 text-sm">{t("selectConversation")}</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 p-4">
                <button
                  onClick={() => setActiveId(null)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
                >
                  <ArrowLeft size={20} />
                </button>
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                    activeConversation.type === "group"
                      ? "bg-pd-navy text-white"
                      : "bg-pd-red text-white"
                  }`}
                >
                  {activeConversation.type === "group" ? (
                    <Users size={16} />
                  ) : (
                    activeConversation.displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {activeConversation.displayName}
                  </p>
                  {activeConversation.type === "group" && (
                    <p className="text-xs text-slate-500">
                      {t("members", { n: activeConversation.members.length })}
                    </p>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
                {loadingThread ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-slate-400" size={24} />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">
                    {t("sayHello")}
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.is_mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                          m.is_mine
                            ? "bg-pd-red text-white"
                            : "bg-white text-slate-900 shadow-sm"
                        }`}
                      >
                        {!m.is_mine &&
                          activeConversation.type === "group" && (
                            <p className="mb-1 text-xs font-semibold text-pd-red">
                              {m.sender_name}
                            </p>
                          )}

                        {m.attachment_url && (
                          <div className="mb-2">
                            {m.attachment_type === "image" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={m.attachment_url}
                                alt={m.attachment_name || ""}
                                className="max-h-64 w-full max-w-[220px] rounded-lg object-cover"
                              />
                            ) : m.attachment_type === "video" ? (
                              <video
                                src={m.attachment_url}
                                controls
                                className="max-h-64 w-full max-w-[260px] rounded-lg"
                              />
                            ) : (
                              <a
                                href={m.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                                  m.is_mine
                                    ? "bg-white/20"
                                    : "bg-slate-100"
                                }`}
                              >
                                <FileText size={16} />
                                {m.attachment_name || t("downloadFile")}
                              </a>
                            )}
                          </div>
                        )}

                        {m.content && (
                          <p className="whitespace-pre-wrap text-sm">
                            {m.content}
                          </p>
                        )}
                        <p
                          className={`mt-1 text-[10px] ${
                            m.is_mine ? "text-white/70" : "text-slate-400"
                          }`}
                        >
                          {timeLabel(m.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={threadEndRef} />
              </div>

              {/* Composer */}
              <div className="shrink-0 border-t border-slate-200 p-3">
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                    title={t("attachFile")}
                  >
                    {uploading ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <Paperclip size={20} />
                    )}
                  </button>
                  <textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    rows={1}
                    placeholder={t("typeMessage")}
                    className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pd-red"
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={sending || (!composer.trim() && !uploading)}
                    className="rounded-xl bg-pd-red p-2.5 text-white transition hover:bg-pd-red-hover disabled:opacity-50"
                  >
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New Direct modal */}
      {showNewDirect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <h2 className="text-lg font-semibold text-slate-900">
                {isAdmin ? t("newMessage") : t("askAdmin")}
              </h2>
              <button
                onClick={() => setShowNewDirect(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>
            <div className="border-b border-slate-200 p-4">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={isAdmin ? t("searchUsers") : t("searchAdmins")}
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-pd-red"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredDirectory.map((u) => (
                <button
                  key={u.id}
                  onClick={() => createDirect(u.id)}
                  disabled={creating}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-pd-red text-sm font-semibold text-white">
                    {(u.full_name || u.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {u.full_name || u.email}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {u.role === "learner" ? t("roleLearner") : t("roleAdmin")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* New Group modal (admin only) */}
      {showNewGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <h2 className="text-lg font-semibold text-slate-900">
                {t("newGroup")}
              </h2>
              <button
                onClick={() => setShowNewGroup(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>
            <div className="border-b border-slate-200 p-4 space-y-3">
              <input
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder={t("groupNamePlaceholder")}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-pd-red"
              />
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={t("searchMembers")}
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-pd-red"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredDirectory.map((u) => {
                const selected = groupMembers.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() =>
                      setGroupMembers((prev) => {
                        const next = new Set(prev);
                        if (next.has(u.id)) next.delete(u.id);
                        else next.add(u.id);
                        return next;
                      })
                    }
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${
                      selected ? "bg-pd-red/5" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-pd-red text-sm font-semibold text-white">
                        {(u.full_name || u.email).charAt(0).toUpperCase()}
                      </div>
                      <p className="truncate text-sm font-medium text-slate-900">
                        {u.full_name || u.email}
                      </p>
                    </div>
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        selected
                          ? "border-pd-red bg-pd-red text-white"
                          : "border-slate-300"
                      }`}
                    >
                      {selected && <Check size={14} />}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 p-4">
              <span className="text-sm text-slate-500">
                {t("selected", { n: groupMembers.size })}
              </span>
              <button
                onClick={createGroup}
                disabled={creating || !groupTitle.trim() || groupMembers.size === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:opacity-50"
              >
                {creating && <Loader2 size={16} className="animate-spin" />}
                {t("createGroup")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
