-- ============================================================
-- AIU Assignment Hub — colored highlights + due time
-- Safe to run: only adds columns, no data loss, no deletions.
-- ============================================================

alter table public.reading_highlights
  add column if not exists word_colors jsonb not null default '{}'::jsonb;

alter table public.assignments
  add column if not exists due_time text;
