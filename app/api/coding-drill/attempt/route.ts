import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/coding-drill/attempt — record a learner's graded drill attempt.
// Multiple attempts per learner per block are allowed (one row each).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { block_id, score, accuracy, exact, missed, extra, events } = body;

  if (!block_id) {
    return NextResponse.json(
      { error: "block_id is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("coding_drill_attempts")
    .insert({
      block_id,
      user_id: user.id,
      score: score ?? 0,
      accuracy: accuracy ?? 0,
      exact: exact ?? 0,
      missed: missed ?? 0,
      extra: extra ?? 0,
      events: events ?? [],
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data?.id });
}

// GET /api/coding-drill/attempt?block_id=... — this learner's attempts for a
// block (most recent first). Used for showing best/previous scores.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const blockId = searchParams.get("block_id");
  if (!blockId) {
    return NextResponse.json(
      { error: "block_id is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("coding_drill_attempts")
    .select("id, score, accuracy, exact, missed, extra, created_at")
    .eq("block_id", blockId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ attempts: data ?? [] });
}
