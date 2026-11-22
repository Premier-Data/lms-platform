import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Every /admin page is for admins only. Several admin pages read learner data
// with the service-role key, so non-admins must never render them.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const isAdmin =
    roles?.some((r) => r.role === "admin" || r.role === "super_admin") ?? false;
  if (!isAdmin) redirect("/dashboard");

  return <>{children}</>;
}
