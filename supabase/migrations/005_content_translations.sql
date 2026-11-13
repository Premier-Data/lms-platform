-- Vietnamese (and future-language) translations of course content.
-- Original English text stays in its own tables; this table only holds the
-- translated copy, keyed by (entity, entity_id, field, locale).
--
-- Run in the LMS Supabase project (veswdkvgcwtzjkcpjaft) SQL editor.

create table if not exists public.content_translations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  entity text not null,        -- course | module | lesson | page | block | quiz_question | quiz_option | quiz_config
  entity_id text not null,
  field text not null,         -- e.g. title, content, json:question_text, json:opt:<optionId>
  locale text not null default 'vi',
  text text not null,
  source_hash text not null,   -- hash of the English text this was translated from (detects outdated translations)
  edited boolean not null default false,  -- true when an admin hand-edited it
  updated_at timestamptz not null default now(),
  unique (entity, entity_id, field, locale)
);

create index if not exists content_translations_course_idx
  on public.content_translations (course_id, locale);

alter table public.content_translations enable row level security;

-- Any signed-in user can read translations. Writes happen only through the
-- admin API (service role), so no insert/update/delete policies are needed.
drop policy if exists "translations readable" on public.content_translations;
create policy "translations readable"
  on public.content_translations
  for select
  to authenticated
  using (true);
