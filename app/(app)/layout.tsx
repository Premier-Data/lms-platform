import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";
import { LanguageToggle } from "@/components/language-toggle";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("header");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Force a password change if an admin flagged this account for reset.
  if (user.user_metadata?.must_reset_password) {
    redirect("/reset-password?forced=1");
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const isAdmin =
    roles?.some(
      (role) =>
        role.role === "super_admin" || role.role === "admin"
    ) ?? false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="app-bg flex min-h-screen flex-col lg:flex-row">
      <AppSidebar isAdmin={isAdmin} />

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md sm:px-8 lg:h-20">
          <div>
            <p className="text-xs text-slate-500 sm:text-sm">{t("welcomeBack")}</p>

            <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
              {profile?.full_name || user.email}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <LanguageToggle tone="light" />
            <NotificationBell />

            <UserMenu
              fullName={profile?.full_name || ""}
              email={user.email || ""}
            />
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}