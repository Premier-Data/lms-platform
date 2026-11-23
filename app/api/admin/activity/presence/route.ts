import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { presenceStatus } from "@/lib/activity";

// GET /api/admin/activity/presence — online status + last active time for
// every user (cheap; used by the People list).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  if (!roles?.some((r) => r.role === "admin" || r.role === "super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await createAdminClient()
    .from("user_presence")
    .select("user_id, last_seen_at, last_active_at");
  if (error) return NextResponse.json({ presence: [] });

  return NextResponse.json({
    presence: (data ?? []).map((p) => ({
      user_id: p.user_id,
      last_active_at: p.last_active_at,
      last_seen_at: p.last_seen_at,
      status: presenceStatus(p.last_seen_at, p.last_active_at),
    })),
  });
}
