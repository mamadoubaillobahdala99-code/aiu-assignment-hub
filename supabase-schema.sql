-- ============================================================
-- AIU Assignment Hub — database schema
-- Run this once in Supabase: SQL Editor → New query → paste → Run
-- ============================================================

-- 1. Profiles (extends Supabase auth with name + role)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('teacher','student')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles viewable by authenticated users"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Automatically create a profile row when someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'User'),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Classes
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  teacher_id uuid not null references public.profiles(id),
  code text not null unique,
  created_at timestamptz default now()
);

alter table public.classes enable row level security;

create policy "classes viewable by authenticated"
  on public.classes for select
  using (auth.role() = 'authenticated');

create policy "teachers can create classes"
  on public.classes for insert
  with check (auth.uid() = teacher_id);

-- 3. Roster (which students joined which class)
create table if not exists public.roster (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  joined_at timestamptz default now(),
  unique (class_id, student_id)
);

alter table public.roster enable row level security;

create policy "roster viewable by authenticated"
  on public.roster for select
  using (auth.role() = 'authenticated');

create policy "students can join classes"
  on public.roster for insert
  with check (auth.uid() = student_id);

-- 4. Assignments
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  type text not null,
  description text,
  due_date date,
  time_limit_minutes integer,
  created_at timestamptz default now()
);

-- If you already ran this script before adding the timer feature,
-- run this line once to add the new column to your existing table:
-- alter table public.assignments add column if not exists time_limit_minutes integer;

alter table public.assignments enable row level security;

create policy "assignments viewable by authenticated"
  on public.assignments for select
  using (auth.role() = 'authenticated');

create policy "teacher can create assignments in own class"
  on public.assignments for insert
  with check (
    exists (
      select 1 from public.classes c
      where c.id = class_id and c.teacher_id = auth.uid()
    )
  );

-- 5. Submissions
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  content text not null default '',
  started_at timestamptz,
  submitted_at timestamptz,
  grade text,
  feedback text,
  graded_at timestamptz,
  unique (assignment_id, student_id)
);

-- If you already ran this script before adding the timer feature,
-- run these two lines once to update your existing table:
-- alter table public.submissions add column if not exists started_at timestamptz;
-- alter table public.submissions alter column content set default '';
-- alter table public.submissions alter column submitted_at drop not null;

alter table public.submissions enable row level security;

create policy "submissions viewable by authenticated"
  on public.submissions for select
  using (auth.role() = 'authenticated');

create policy "students can submit own work"
  on public.submissions for insert
  with check (auth.uid() = student_id);

create policy "students can update own submission"
  on public.submissions for update
  using (auth.uid() = student_id);

create policy "teachers can grade submissions in own class"
  on public.submissions for update
  using (
    exists (
      select 1 from public.assignments a
      join public.classes c on c.id = a.class_id
      where a.id = assignment_id and c.teacher_id = auth.uid()
    )
  );

-- Done. You should see 5 new tables under Table Editor:
-- profiles, classes, roster, assignments, submissions
