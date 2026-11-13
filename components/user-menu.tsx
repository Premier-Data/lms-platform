"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { User, Settings, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type UserMenuProps = {
  fullName: string;
  email: string;
};

export function UserMenu({ fullName, email }: UserMenuProps) {
  const t = useTranslations("userMenu");
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const initial = (fullName || email || "U").charAt(0).toUpperCase();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-pd-red text-sm font-semibold text-white transition hover:opacity-90"
        aria-label={t("ariaLabel")}
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {/* User info header */}
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pd-red text-sm font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {fullName || t("account")}
              </p>
              <p className="truncate text-xs text-slate-500">{email}</p>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/account");
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              <User size={16} />
              {t("myProfile")}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                router.push("/account");
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              <Settings size={16} />
              {t("accountSettings")}
            </button>
          </div>

          <div className="border-t border-slate-200 py-1">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50"
            >
              <LogOut size={16} />
              {t("signOut")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
