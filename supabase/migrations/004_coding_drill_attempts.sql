-- Coding drill attempts (reference documentation)
--
-- Stores each learner attempt at a "coding drill" lesson block. The drill's
-- configuration (video, stats, master timeline, tolerance) lives in the block's
-- own jsonb `content`, so only attempts need a dedicated table. Multiple
-- attempts per learner per block are allowed (one row each).
--
-- NOTE: As with 001-003, this Supabase project's SQL Editor lacks privileges to
-- create tables in the public schema ("must be owner of table" /
-- "permission denied for schema public"). Create this table via the Supabase
-- Table Editor UI instead, using the columns below. RLS can be left as-is
-- because all reads/writes go through the service-role admin API, which
-- verifies the caller's auth in code.
--
--   Table: public.coding_drill_attempts
--   Columns:
--     id          uuid        primary key, default gen_random_uuid()
--     block_id    uuid        not null   (references the lesson_blocks row)
--     user_id     uuid        not null   (the learner)
--     score       integer     not null default 0   (exact matches)
--     accuracy    integer     not null default 0   (0-100 percentage)
--     exact       integer     not null default 0
--     missed      integer     not null default 0
--     extra       integer     not null default 0
--     events      jsonb       not null default '[]'  (learner's submitted timeline)
--     created_at  timestamptz not null default now()
--
-- Intended DDL for an environment where you have owner rights:

create table if not exists public.coding_drill_attempts (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null,
  user_id uuid not null,
  score integer not null default 0,
  accuracy integer not null default 0,
  exact integer not null default 0,
  missed integer not null default 0,
  extra integer not null default 0,
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists coding_drill_attempts_block_user_idx
  on public.coding_drill_attempts (block_id, user_id);
