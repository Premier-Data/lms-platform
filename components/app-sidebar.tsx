"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  Users,
  BarChart3,
  Settings,
  ShieldCheck,
  Route,
  Menu,
  X,
  MessageSquare,
  HardDrive,
  Image as ImageIcon,
} from "lucide-react";

type AppSidebarProps = {
  isAdmin: boolean;
};

const learnerNavigation = [
  {
    name: "dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "myLearning",
    href: "/courses",
    icon: BookOpen,
  },
  {
    name: "messages",
    href: "/messages",
    icon: MessageSquare,
  },
];

const adminNavigation = [
  {
    name: "courseBuilder",
    href: "/admin/courses",
    icon: BookOpen,
  },
  {
    name: "courses",
    href: "/admin/allocations",
    icon: GraduationCap,
  },
  {
    name: "learningPaths",
    href: "/admin/learning-paths",
    icon: Route,
  },
  {
    name: "gallery",
    href: "/admin/gallery",
    icon: ImageIcon,
  },
  {
    name: "people",
    href: "/admin/people",
    icon: Users,
  },
  {
    name: "reports",
    href: "/admin/reports",
    icon: BarChart3,
  },
];

export function AppSidebar({ isAdmin }: AppSidebarProps) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [storage, setStorage] = useState<{
    usedBytes: number;
    limitBytes: number;
  } | null>(null);

  // Poll unread message count for the Messages badge
  useEffect(() => {
    let active = true;
    async function fetchUnread() {
      try {
        const res = await fetch("/api/conversations/unread");
        if (res.ok && active) {
          const data = await res.json();
          setUnreadMessages(data.unread ?? 0);
        }
      } catch {
        // ignore
      }
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pathname]);

  // Fetch storage usage (admins only; 403 for learners is ignored)
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    async function fetchStorage() {
      try {
        const res = await fetch("/api/admin/files/usage");
        if (res.ok && active) {
          setStorage(await res.json());
        }
      } catch {
        // ignore
      }
    }
    fetchStorage();
    const interval = setInterval(fetchStorage, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isAdmin, pathname]);

  function formatBytes(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  }

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const sidebarContent = (
    <>
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
        <div className="h-10 w-10 overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon.png"
            alt="Premier Data"
            className="h-full w-full object-cover"
          />
        </div>

        <div>
          <h1 className="font-extrabold tracking-tight text-white">
            PREMIER<span className="text-pd-red">DATA</span>
          </h1>
          <p className="text-xs text-slate-400">{tc("appTagline")}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t("learning")}
        </p>

        <div className="space-y-1">
          {learnerNavigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            const showBadge =
              item.href === "/messages" && unreadMessages > 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-pd-red text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={19} />
                <span className="flex-1">{t(item.name)}</span>
                {showBadge && (
                  <span
                    className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-bold ${
                      active ? "bg-white text-pd-red" : "bg-pd-red text-white"
                    }`}
                  >
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {isAdmin && (
          <>
            <div className="my-7 border-t border-white/10" />

            <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("administration")}
            </p>

            <div className="space-y-1">
              {adminNavigation.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? "bg-pd-red text-white"
                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon size={19} />
                    {t(item.name)}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-white/10 p-4">
        {/* Storage usage (admins) */}
        {isAdmin && storage && (
          <Link
            href="/admin/gallery"
            className="mb-3 block rounded-lg px-3 py-2.5 transition hover:bg-white/5"
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <HardDrive size={14} />
              {t("storage")}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${
                  storage.usedBytes / storage.limitBytes >= 1
                    ? "bg-red-500"
                    : storage.usedBytes / storage.limitBytes >= 0.85
                      ? "bg-amber-500"
                      : "bg-pd-red"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    (storage.usedBytes / storage.limitBytes) * 100
                  )}%`,
                }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {t("storageUsed", { used: formatBytes(storage.usedBytes), limit: formatBytes(storage.limitBytes) })}
            </p>
          </Link>
        )}

        <Link
          href="/account"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <Settings size={19} />
          {t("account")}
        </Link>

        {isAdmin && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-slate-200">
            <ShieldCheck size={15} />
            {t("administrator")}
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar with hamburger */}
      <div className="flex h-16 items-center justify-between border-b border-white/10 bg-pd-navy px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon.png"
              alt="Premier Data"
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="text-sm font-extrabold tracking-tight text-white">
            PREMIER<span className="text-pd-red">DATA</span>
          </h1>
        </div>

        <button
          onClick={() => setMobileOpen(true)}
          className="relative rounded-lg p-2 text-white transition hover:bg-white/10"
          aria-label={t("openMenu")}
        >
          <Menu size={24} />
          {unreadMessages > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-pd-red px-1 text-[10px] font-bold text-white">
              {unreadMessages > 9 ? "9+" : unreadMessages}
            </span>
          )}
        </button>
      </div>

      {/* Desktop sidebar (always visible on lg+, pinned to viewport) */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-white/10 bg-pd-navy lg:flex">
        {sidebarContent}
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-pd-navy transition-transform duration-300 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-3 rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label={t("closeMenu")}
        >
          <X size={22} />
        </button>
        {sidebarContent}
      </aside>
    </>
  );
}
