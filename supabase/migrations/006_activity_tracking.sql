-- Learner activity tracking (run in the LMS project veswdkvgcwtzjkcpjaft).
--
-- activity_segments: one row per continuous stretch of activity. A stretch
--   ends when the learner has done nothing for 5 minutes (the gap is a break),
--   or when they move to a different course (so time per course is exact).
-- user_presence: one row per user, refreshed every ~30s while the LMS is open,
--   used for the "online now / idle / offline" status.
--
-- Both tables are written only by the server (service role) after it checks
-- the signed-in user, so RLS is enabled with no policies (no direct access).

create table if not exists public.activity_segments (
  id uuid primary key,                      -- generated in the browser
  user_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,            -- last activity in the stretch
  course_id uuid,                           -- null when not inside a course
  path text,                                -- page the stretch started on
  created_at timestamptz not null default now()
);

create index if not exists activity_segments_user_time_idx
  on public.activity_segments (user_id, started_at);
create index if not exists activity_segments_time_idx
  on public.activity_segments (started_at);

alter table public.activity_segments enable row level security;

create table if not exists public.user_presence (
  user_id uuid primary key,
  last_seen_at timestamptz not null,        -- LMS open in a browser tab
  last_active_at timestamptz,               -- last real interaction
  course_id uuid,
  path text
);

alter table public.user_presence enable row level security;
