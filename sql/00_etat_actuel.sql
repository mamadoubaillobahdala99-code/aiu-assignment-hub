-- =====================================================================
--  AIU Assignment Hub — 00_etat_actuel.sql
--  PHOTO de la base Supabase telle qu'elle est le 26 septembre 2026
--  (apres les scripts 09 a 32). Lue en lecture seule, verifiee par
--  empreintes (md5) contre la base : voir sql/README.md.
--
--  NE PAS EXECUTER SUR LA BASE ACTUELLE : elle contient deja tout ceci.
--  Ce fichier sert a LIRE l'etat exact de la base (tables, regles RLS,
--  fonctions, droits) et, en cas de besoin, a reconstruire une base
--  NEUVE et VIDE. Il ne contient AUCUNE donnee (aucun eleve, aucune copie,
--  aucun identifiant, aucune cle).
--
--  Garde-fou : la premiere instruction arrete tout. Pour reconstruire une
--  base neuve, il faudrait la retirer volontairement.
-- =====================================================================

do $$ begin
  raise exception 'Photo de reference : ne pas executer sur la base actuelle (voir sql/README.md).';
end $$;

-- Extensions presentes : plpgsql, pgcrypto, uuid-ossp, pg_stat_statements, supabase_vault
-- (installees par Supabase ; gen_random_uuid() vient de Postgres).

-- =====================================================================
-- 1. TABLES (23) — toutes avec la RLS activee
-- =====================================================================

create table public.assignment_feedback (
  id uuid not null default gen_random_uuid(),
  assignment_id uuid not null,
  student_id uuid not null,
  band text,
  feedback text,
  released_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table public.assignment_questions (
  id uuid not null default gen_random_uuid(),
  section_id uuid not null,
  question_id uuid not null,
  order_index integer not null default 0,
  group_id uuid
);

create table public.assignments (
  id uuid not null default gen_random_uuid(),
  class_id uuid not null,
  title text not null,
  type text not null,
  description text,
  due_date date,
  time_limit_minutes integer,
  created_at timestamp with time zone default now(),
  target_word_count integer,
  image_url text,
  reading_question_count integer,
  due_time text,
  reading_questions_text text,
  allow_audio_pause boolean not null default false,
  auto_release_score boolean not null default true,
  show_answer_review boolean not null default true,
  reading_test_type text not null default 'academic'::text,
  listening_audio_url text,
  listening_exam_mode boolean not null default false,
  listening_check_minutes integer not null default 2
);

create table public.classes (
  id uuid not null default gen_random_uuid(),
  name text not null,
  teacher_id uuid not null,
  code text not null,
  created_at timestamp with time zone default now(),
  kind text not null default 'class'::text
);

create table public.exam_attempt_pages (
  assignment_id uuid not null,
  student_id uuid not null,
  page_token uuid not null,
  updated_at timestamp with time zone not null default now()
);

create table public.exam_attempts (
  assignment_id uuid not null,
  student_id uuid not null,
  started_at timestamp with time zone not null default now(),
  submitted_at timestamp with time zone,
  audio_started_at timestamp with time zone
);

create table public.exam_incidents (
  id uuid not null default gen_random_uuid(),
  session_id uuid not null,
  student_id uuid not null,
  assignment_id uuid,
  kind text not null,
  freezes boolean not null default false,
  reason text,
  at timestamp with time zone not null default now(),
  cleared_at timestamp with time zone,
  cleared_by uuid
);

create table public.exam_sections (
  id uuid not null default gen_random_uuid(),
  assignment_id uuid not null,
  title text,
  order_index integer not null default 0,
  created_at timestamp with time zone default now(),
  passage_text text,
  instruction text,
  passage_title text,
  audio_url text,
  max_plays integer,
  image_url text,
  task_number smallint,
  speaking_part smallint,
  documents jsonb not null default '[]'::jsonb
);

create table public.exam_session_items (
  id uuid not null default gen_random_uuid(),
  session_id uuid not null,
  assignment_id uuid not null,
  order_index integer not null default 0,
  audio_started_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table public.exam_session_staff (
  session_id uuid not null,
  teacher_id uuid not null,
  role text not null default 'co'::text,
  added_at timestamp with time zone not null default now()
);

create table public.exam_sessions (
  id uuid not null default gen_random_uuid(),
  name text not null,
  code text not null,
  container_class_id uuid not null,
  created_by uuid not null,
  opens_at timestamp with time zone,
  closes_at timestamp with time zone,
  opened_at timestamp with time zone,
  closed_at timestamp with time zone,
  strict_mode boolean not null default true,
  listening_start text not null default 'individual'::text,
  results_released_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table public.listening_plays (
  assignment_id uuid not null,
  student_id uuid not null,
  section_id uuid not null,
  plays_used integer not null default 0
);

create table public.profiles (
  id uuid not null,
  name text not null,
  role text not null,
  created_at timestamp with time zone default now()
);

create table public.question_answer_key (
  question_id uuid not null,
  correct_answer jsonb not null
);

create table public.question_groups (
  id uuid not null default gen_random_uuid(),
  section_id uuid not null,
  instruction text,
  passage_text text,
  order_index integer not null default 0,
  created_at timestamp with time zone default now(),
  image_url text
);

create table public.questions (
  id uuid not null default gen_random_uuid(),
  teacher_id uuid not null,
  type text not null,
  skill text not null,
  prompt text not null,
  options jsonb not null default '{}'::jsonb,
  points integer not null default 1,
  created_at timestamp with time zone default now()
);

create table public.reading_highlights (
  id uuid not null default gen_random_uuid(),
  assignment_id uuid not null,
  student_id uuid not null,
  word_indices integer[] not null default '{}'::integer[],
  updated_at timestamp with time zone default now(),
  word_colors jsonb not null default '{}'::jsonb,
  section_id uuid,
  scope_type text not null default 'passage'::text,
  question_id uuid,
  option_key text
);

create table public.roster (
  id uuid not null default gen_random_uuid(),
  class_id uuid not null,
  student_id uuid not null,
  joined_at timestamp with time zone default now()
);

create table public.speaking_views (
  assignment_id uuid not null,
  student_id uuid not null,
  first_viewed_at timestamp with time zone not null default now()
);

create table public.student_answers (
  id uuid not null default gen_random_uuid(),
  assignment_id uuid not null,
  student_id uuid not null,
  question_id uuid not null,
  response jsonb not null,
  is_correct boolean,
  answered_at timestamp with time zone default now(),
  points_earned numeric
);

create table public.submissions (
  id uuid not null default gen_random_uuid(),
  assignment_id uuid not null,
  student_id uuid not null,
  content text not null default ''::text,
  started_at timestamp with time zone,
  submitted_at timestamp with time zone,
  grade text,
  feedback text,
  graded_at timestamp with time zone,
  score_task_achievement numeric(3,1),
  score_coherence_cohesion numeric(3,1),
  score_lexical_resource numeric(3,1),
  score_grammar_accuracy numeric(3,1)
);

create table public.writing_grades (
  id uuid not null default gen_random_uuid(),
  assignment_id uuid not null,
  section_id uuid not null,
  student_id uuid not null,
  corrected_html text not null default ''::text,
  score_ta numeric(2,1),
  score_cc numeric(2,1),
  score_lr numeric(2,1),
  score_gra numeric(2,1),
  task_band numeric(2,1),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.writing_responses (
  id uuid not null default gen_random_uuid(),
  assignment_id uuid not null,
  section_id uuid not null,
  student_id uuid not null,
  content_html text not null default ''::text,
  word_count integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  submitted_at timestamp with time zone
);

-- =====================================================================
-- 2. CONTRAINTES (cles, unicite, verifications, liens)
-- =====================================================================

alter table public.assignment_feedback add constraint assignment_feedback_pkey PRIMARY KEY (id);
alter table public.assignment_questions add constraint assignment_questions_pkey PRIMARY KEY (id);
alter table public.assignments add constraint assignments_pkey PRIMARY KEY (id);
alter table public.classes add constraint classes_pkey PRIMARY KEY (id);
alter table public.exam_attempt_pages add constraint exam_attempt_pages_pkey PRIMARY KEY (assignment_id, student_id);
alter table public.exam_attempts add constraint exam_attempts_pkey PRIMARY KEY (assignment_id, student_id);
alter table public.exam_incidents add constraint exam_incidents_pkey PRIMARY KEY (id);
alter table public.exam_sections add constraint exam_sections_pkey PRIMARY KEY (id);
alter table public.exam_session_items add constraint exam_session_items_pkey PRIMARY KEY (id);
alter table public.exam_session_staff add constraint exam_session_staff_pkey PRIMARY KEY (session_id, teacher_id);
alter table public.exam_sessions add constraint exam_sessions_pkey PRIMARY KEY (id);
alter table public.listening_plays add constraint listening_plays_pkey PRIMARY KEY (assignment_id, student_id, section_id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.question_answer_key add constraint question_answer_key_pkey PRIMARY KEY (question_id);
alter table public.question_groups add constraint question_groups_pkey PRIMARY KEY (id);
alter table public.questions add constraint questions_pkey PRIMARY KEY (id);
alter table public.reading_highlights add constraint reading_highlights_pkey PRIMARY KEY (id);
alter table public.roster add constraint roster_pkey PRIMARY KEY (id);
alter table public.speaking_views add constraint speaking_views_pkey PRIMARY KEY (assignment_id, student_id);
alter table public.student_answers add constraint student_answers_pkey PRIMARY KEY (id);
alter table public.submissions add constraint submissions_pkey PRIMARY KEY (id);
alter table public.writing_grades add constraint writing_grades_pkey PRIMARY KEY (id);
alter table public.writing_responses add constraint writing_responses_pkey PRIMARY KEY (id);
alter table public.assignment_feedback add constraint assignment_feedback_assignment_id_student_id_key UNIQUE (assignment_id, student_id);
alter table public.classes add constraint classes_code_key UNIQUE (code);
alter table public.exam_session_items add constraint exam_session_items_assignment_id_key UNIQUE (assignment_id);
alter table public.exam_sessions add constraint exam_sessions_code_key UNIQUE (code);
alter table public.reading_highlights add constraint reading_highlights_scope_key UNIQUE (assignment_id, student_id, scope_type, section_id, question_id, option_key);
alter table public.roster add constraint roster_class_id_student_id_key UNIQUE (class_id, student_id);
alter table public.student_answers add constraint student_answers_student_id_question_id_key UNIQUE (student_id, question_id);
alter table public.submissions add constraint submissions_assignment_id_student_id_key UNIQUE (assignment_id, student_id);
alter table public.writing_grades add constraint writing_grades_one_per_task UNIQUE (section_id, student_id);
alter table public.writing_responses add constraint writing_responses_one_per_task UNIQUE (section_id, student_id);
alter table public.assignments add constraint assignments_listening_audio_url_https CHECK (((listening_audio_url IS NULL) OR (listening_audio_url ~~ 'https://%'::text)));
alter table public.assignments add constraint assignments_listening_check_minutes_range CHECK (((listening_check_minutes >= 0) AND (listening_check_minutes <= 30)));
alter table public.assignments add constraint assignments_reading_test_type_check CHECK ((reading_test_type = ANY (ARRAY['academic'::text, 'general'::text])));
alter table public.classes add constraint classes_kind_check CHECK ((kind = ANY (ARRAY['class'::text, 'exam'::text])));
alter table public.exam_incidents add constraint exam_incidents_kind_check CHECK ((kind = ANY (ARRAY['fullscreen_exit'::text, 'tab_switch'::text, 'paste'::text, 'context_menu'::text, 'copy'::text, 'page_reload'::text])));
alter table public.exam_sections add constraint exam_sections_documents_is_array CHECK (((jsonb_typeof(documents) = 'array'::text) AND (jsonb_array_length(documents) <= 20)));
alter table public.exam_sections add constraint exam_sections_speaking_part_check CHECK (((speaking_part IS NULL) OR (speaking_part = ANY (ARRAY[1, 2, 3]))));
alter table public.exam_sections add constraint exam_sections_task_number_check CHECK (((task_number IS NULL) OR (task_number = ANY (ARRAY[1, 2]))));
alter table public.exam_sessions add constraint exam_sessions_listening_start_check CHECK ((listening_start = ANY (ARRAY['individual'::text, 'grouped'::text])));
alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['teacher'::text, 'student'::text])));
alter table public.question_groups add constraint question_groups_image_url_https CHECK (((image_url IS NULL) OR ((image_url ~~ 'https://%'::text) AND (length(image_url) <= 2000))));
alter table public.writing_grades add constraint writing_grades_scores CHECK ((((score_ta IS NULL) OR (((score_ta >= (0)::numeric) AND (score_ta <= (9)::numeric)) AND ((score_ta * (2)::numeric) = trunc((score_ta * (2)::numeric))))) AND ((score_cc IS NULL) OR (((score_cc >= (0)::numeric) AND (score_cc <= (9)::numeric)) AND ((score_cc * (2)::numeric) = trunc((score_cc * (2)::numeric))))) AND ((score_lr IS NULL) OR (((score_lr >= (0)::numeric) AND (score_lr <= (9)::numeric)) AND ((score_lr * (2)::numeric) = trunc((score_lr * (2)::numeric))))) AND ((score_gra IS NULL) OR (((score_gra >= (0)::numeric) AND (score_gra <= (9)::numeric)) AND ((score_gra * (2)::numeric) = trunc((score_gra * (2)::numeric))))) AND ((task_band IS NULL) OR (((task_band >= (0)::numeric) AND (task_band <= (9)::numeric)) AND ((task_band * (2)::numeric) = trunc((task_band * (2)::numeric)))))));
alter table public.writing_grades add constraint writing_grades_text_size CHECK ((length(corrected_html) <= 300000));
alter table public.assignment_feedback add constraint assignment_feedback_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.assignment_feedback add constraint assignment_feedback_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.assignment_questions add constraint assignment_questions_group_id_fkey FOREIGN KEY (group_id) REFERENCES question_groups(id) ON DELETE CASCADE;
alter table public.assignment_questions add constraint assignment_questions_question_id_fkey FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;
alter table public.assignment_questions add constraint assignment_questions_section_id_fkey FOREIGN KEY (section_id) REFERENCES exam_sections(id) ON DELETE CASCADE;
alter table public.assignments add constraint assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
alter table public.classes add constraint classes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.exam_attempt_pages add constraint exam_attempt_pages_assignment_id_student_id_fkey FOREIGN KEY (assignment_id, student_id) REFERENCES exam_attempts(assignment_id, student_id) ON DELETE CASCADE;
alter table public.exam_attempts add constraint exam_attempts_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.exam_attempts add constraint exam_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.exam_incidents add constraint exam_incidents_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL;
alter table public.exam_incidents add constraint exam_incidents_cleared_by_fkey FOREIGN KEY (cleared_by) REFERENCES profiles(id);
alter table public.exam_incidents add constraint exam_incidents_session_id_fkey FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE;
alter table public.exam_incidents add constraint exam_incidents_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.exam_sections add constraint exam_sections_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.exam_session_items add constraint exam_session_items_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.exam_session_items add constraint exam_session_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE;
alter table public.exam_session_staff add constraint exam_session_staff_session_id_fkey FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE;
alter table public.exam_session_staff add constraint exam_session_staff_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.exam_sessions add constraint exam_sessions_container_class_id_fkey FOREIGN KEY (container_class_id) REFERENCES classes(id) ON DELETE CASCADE;
alter table public.exam_sessions add constraint exam_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.listening_plays add constraint listening_plays_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.listening_plays add constraint listening_plays_section_id_fkey FOREIGN KEY (section_id) REFERENCES exam_sections(id) ON DELETE CASCADE;
alter table public.listening_plays add constraint listening_plays_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.question_answer_key add constraint question_answer_key_question_id_fkey FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;
alter table public.question_groups add constraint question_groups_section_id_fkey FOREIGN KEY (section_id) REFERENCES exam_sections(id) ON DELETE CASCADE;
alter table public.questions add constraint questions_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES profiles(id);
alter table public.reading_highlights add constraint reading_highlights_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.reading_highlights add constraint reading_highlights_question_id_fkey FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;
alter table public.reading_highlights add constraint reading_highlights_section_id_fkey FOREIGN KEY (section_id) REFERENCES exam_sections(id) ON DELETE CASCADE;
alter table public.reading_highlights add constraint reading_highlights_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.roster add constraint roster_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
alter table public.roster add constraint roster_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.speaking_views add constraint speaking_views_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.speaking_views add constraint speaking_views_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.student_answers add constraint student_answers_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.student_answers add constraint student_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;
alter table public.student_answers add constraint student_answers_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id);
alter table public.submissions add constraint submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.submissions add constraint submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.writing_grades add constraint writing_grades_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.writing_grades add constraint writing_grades_section_id_fkey FOREIGN KEY (section_id) REFERENCES exam_sections(id) ON DELETE CASCADE;
alter table public.writing_grades add constraint writing_grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.writing_responses add constraint writing_responses_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.writing_responses add constraint writing_responses_section_id_fkey FOREIGN KEY (section_id) REFERENCES exam_sections(id) ON DELETE CASCADE;
alter table public.writing_responses add constraint writing_responses_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- =====================================================================
-- 3. INDEX
-- =====================================================================

CREATE INDEX idx_aq_group ON public.assignment_questions USING btree (group_id);
CREATE INDEX idx_aq_question ON public.assignment_questions USING btree (question_id);
CREATE INDEX idx_aq_section ON public.assignment_questions USING btree (section_id);
CREATE INDEX idx_assignments_class ON public.assignments USING btree (class_id);
CREATE INDEX idx_exam_incidents_open ON public.exam_incidents USING btree (session_id, student_id, cleared_at) WHERE freezes;
CREATE INDEX idx_exam_incidents_session ON public.exam_incidents USING btree (session_id, student_id);
CREATE INDEX idx_exam_sections_assignment ON public.exam_sections USING btree (assignment_id);
CREATE INDEX idx_exam_items_assignment ON public.exam_session_items USING btree (assignment_id);
CREATE INDEX idx_exam_items_session ON public.exam_session_items USING btree (session_id, order_index);
CREATE INDEX idx_exam_staff_session ON public.exam_session_staff USING btree (session_id, teacher_id);
CREATE INDEX idx_exam_staff_teacher ON public.exam_session_staff USING btree (teacher_id);
CREATE INDEX idx_exam_sessions_container ON public.exam_sessions USING btree (container_class_id);
CREATE INDEX idx_question_groups_section ON public.question_groups USING btree (section_id);
CREATE INDEX idx_student_answers_assignment_stud ON public.student_answers USING btree (assignment_id, student_id);
CREATE INDEX writing_grades_assignment_idx ON public.writing_grades USING btree (assignment_id, student_id);
CREATE INDEX writing_responses_assignment_idx ON public.writing_responses USING btree (assignment_id, student_id);

-- =====================================================================
-- 4. RLS ACTIVEE SUR LES 23 TABLES
-- =====================================================================

alter table public.assignment_feedback enable row level security;
alter table public.assignment_questions enable row level security;
alter table public.assignments enable row level security;
alter table public.classes enable row level security;
alter table public.exam_attempt_pages enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_incidents enable row level security;
alter table public.exam_sections enable row level security;
alter table public.exam_session_items enable row level security;
alter table public.exam_session_staff enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.listening_plays enable row level security;
alter table public.profiles enable row level security;
alter table public.question_answer_key enable row level security;
alter table public.question_groups enable row level security;
alter table public.questions enable row level security;
alter table public.reading_highlights enable row level security;
alter table public.roster enable row level security;
alter table public.speaking_views enable row level security;
alter table public.student_answers enable row level security;
alter table public.submissions enable row level security;
alter table public.writing_grades enable row level security;
alter table public.writing_responses enable row level security;

-- =====================================================================
-- 5. FONCTIONS (60)
--    Chaque corps est celui de la base ; la ligne « Source » dit quel
--    script l'a ecrit en dernier.
-- =====================================================================

set check_function_bodies = off;

-- answers_released — Source : 09_rls_exam_content.sql
create or replace function public.answers_released(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from assignments a
    where a.id = p_assignment_id
      and ( a.auto_release_score = true
         or exists (select 1
                      from assignment_feedback f
                     where f.assignment_id = a.id
                       and f.student_id    = auth.uid()
                       and f.released_at is not null) )
  );
$fn$;

-- can_read_assignment — Source : 12_exam_sessions.sql
create or replace function public.can_read_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from assignments a
    join classes c on c.id = a.class_id
    where a.id = p_assignment_id
      and (
        -- le prof proprietaire du contenant
        c.teacher_id = auth.uid()
        -- un prof invite sur la session
        or (c.kind = 'exam' and exists (
              select 1 from exam_sessions e
              where e.container_class_id = c.id and public.is_exam_staff(e.id)))
        -- une classe ordinaire : l'inscription suffit
        or (c.kind = 'class' and exists (
              select 1 from roster r where r.class_id = c.id and r.student_id = auth.uid()))
        -- une session d'examen : l'epreuve doit etre deverrouillee
        or (c.kind = 'exam' and public.exam_item_readable(p_assignment_id))
      )
  );
$fn$;

-- can_read_question — Source : 31_lock_content_reads.sql
create or replace function public.can_read_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select
    -- prof invité sur la session qui contient cette question (script 20)
    public.is_exam_staff_of_question(p_question_id)
    -- le paper qui contient la question est lisible (mêmes règles qu'au-dessus)
    or exists (
      select 1
      from assignment_questions aq
      join exam_sections s on s.id = aq.section_id
      where aq.question_id = p_question_id
        and public.can_read_assignment(s.assignment_id)
    );
$fn$;

-- can_read_section — Source : 31_lock_content_reads.sql
create or replace function public.can_read_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from exam_sections s
    where s.id = p_section_id
      and (
        -- le paper est lisible : prof propriétaire, prof invité, élève
        -- d'une classe, candidat seulement si l'épreuve est ouverte pour lui
        public.can_read_assignment(s.assignment_id)
        -- prof invité sur la session qui contient cette épreuve (script 20)
        or public.is_exam_staff_of_assignment(s.assignment_id)
      )
  );
$fn$;

-- can_read_storage_file — Source : 23_storage_read.sql
create or replace function public.can_read_storage_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  with k as (
    select p_name as path,
           'https://bwfynibzijxuiitmdrtw.supabase.co/storage/v1/object/public/assignment-files/' || p_name as url
  )
  select coalesce(p_name, '') <> ''
  and (
    -- audio unique du Listening, image du devoir
    exists (
      select 1 from assignments a, k
      where (a.listening_audio_url in (k.path, k.url) or a.image_url in (k.path, k.url))
        and public.can_read_assignment(a.id)
    )
    -- audio d'une partie, image du Writing, images dans un passage
    or exists (
      select 1 from exam_sections s, k
      where (   s.audio_url in (k.path, k.url)
             or s.image_url in (k.path, k.url)
             or strpos(coalesce(s.passage_text, ''), '[[image:' || k.url || ']]') > 0
             or strpos(coalesce(s.passage_text, ''), '[[image:' || k.path || ']]') > 0)
        and public.can_read_assignment(s.assignment_id)
    )
    -- documents du Speaking
    or exists (
      select 1
      from exam_sections s, k,
           jsonb_array_elements(case when jsonb_typeof(s.documents) = 'array' then s.documents else '[]'::jsonb end) d
      where (d->>'path' = k.path or d->>'url' in (k.path, k.url))
        and public.can_read_assignment(s.assignment_id)
    )
    -- image d'un groupe de questions, images dans le texte d'un groupe
    or exists (
      select 1
      from question_groups g
      join exam_sections s on s.id = g.section_id, k
      where (   g.image_url in (k.path, k.url)
             or strpos(coalesce(g.passage_text, ''), '[[image:' || k.url || ']]') > 0
             or strpos(coalesce(g.passage_text, ''), '[[image:' || k.path || ']]') > 0)
        and public.can_read_assignment(s.assignment_id)
    )
  );
$fn$;

-- can_write_class_file — Source : 11_rls_storage_profiles.sql
create or replace function public.can_write_class_file(p_folder text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare v uuid;
begin
  begin
    v := p_folder::uuid;
  exception when others then
    return false;   -- pas un identifiant de classe : refusé
  end;
  return public.is_class_teacher(v) or public.is_enrolled(v);
end $fn$;

-- create_exam_session — Source : 12_exam_sessions.sql
create or replace function public.create_exam_session(p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_teacher uuid := auth.uid();
  v_role    text;
  v_code    text;
  v_class   uuid;
  v_session uuid;
  v_try     integer := 0;
begin
  if v_teacher is null then raise exception 'Not authenticated'; end if;
  select role into v_role from profiles where id = v_teacher;
  if v_role is distinct from 'teacher' then raise exception 'Only a teacher can create an exam'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'A name is required'; end if;

  -- Un code court, unique, jamais celui d'une classe.
  loop
    v_try := v_try + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from classes where upper(code) = v_code)
          and not exists (select 1 from exam_sessions where upper(code) = v_code);
    if v_try > 20 then raise exception 'Could not allocate a code'; end if;
  end loop;

  insert into classes (name, teacher_id, code, kind)
  values (left(trim(p_name), 120), v_teacher, 'EX-' || v_code, 'exam')
  returning id into v_class;

  insert into exam_sessions (name, code, container_class_id, created_by)
  values (left(trim(p_name), 120), v_code, v_class, v_teacher)
  returning id into v_session;

  insert into exam_session_staff (session_id, teacher_id, role) values (v_session, v_teacher, 'owner');

  return jsonb_build_object('session_id', v_session, 'code', v_code, 'container_class_id', v_class);
end $fn$;

-- delete_exam_session — Source : 16_exam_manage.sql
create or replace function public.delete_exam_session(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_src record; v_qids uuid[]; v_removed integer := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_src from exam_sessions where id = p_session_id;
  if not found then raise exception 'Exam not found'; end if;
  if v_src.created_by <> auth.uid() then raise exception 'Only the creator can delete this exam'; end if;
  if v_src.opened_at is not null and v_src.closed_at is null then
    raise exception 'This exam is running — close it first';
  end if;

  select coalesce(array_agg(distinct aq.question_id), '{}')
    into v_qids
  from assignment_questions aq
  join exam_sections es on es.id = aq.section_id
  join assignments a    on a.id = es.assignment_id
  where a.class_id = v_src.container_class_id;

  delete from exam_sessions where id = p_session_id;      -- items + staff en cascade
  delete from classes       where id = v_src.container_class_id;  -- epreuves, parties, groupes, liens, copies

  if array_length(v_qids, 1) > 0 then
    delete from questions q
     where q.id = any(v_qids)
       and not exists (select 1 from assignment_questions aq where aq.question_id = q.id);
    get diagnostics v_removed = row_count;
  end if;

  return jsonb_build_object('deleted', true, 'questions_removed', v_removed);
end $fn$;

-- duplicate_assignment — Source : 26_duplicate_assignment.sql
create or replace function public.duplicate_assignment(p_assignment_id uuid, p_target_class_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_src      record;
  v_target   record;
  v_session  uuid;
  v_to_exam  boolean;
  v_new_a    uuid;
  v_new_s    uuid;
  v_new_g    uuid;
  v_new_q    uuid;
  v_sec      record;
  v_grp      record;
  v_link     record;
  v_next     integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- Le paper d'origine : a moi, ou d'un examen dont je fais partie de l'equipe.
  select a.*, c.teacher_id as owner_id into v_src
  from assignments a join classes c on c.id = a.class_id
  where a.id = p_assignment_id;
  if not found then raise exception 'Paper not found'; end if;
  if v_src.owner_id is distinct from auth.uid()
     and not public.is_exam_staff_of_assignment(p_assignment_id) then
    raise exception 'Not allowed';
  end if;

  -- La destination.
  select * into v_target from classes where id = p_target_class_id;
  if not found then raise exception 'Destination not found'; end if;

  if v_target.kind = 'exam' then
    select e.id into v_session
    from exam_sessions e
    where e.container_class_id = v_target.id
      and public.is_exam_staff(e.id)
    limit 1;
    if v_session is null then raise exception 'Not allowed'; end if;
    if exists (select 1 from exam_sessions e
               where e.id = v_session
                 and (e.opened_at is not null or e.closed_at is not null
                      or e.results_released_at is not null or public.exam_is_open(e.id))) then
      raise exception 'This exam has already started: papers can no longer be added';
    end if;
    v_to_exam := true;
  elsif v_target.kind = 'class' and v_target.teacher_id = auth.uid() then
    v_to_exam := false;
  else
    raise exception 'Not allowed';
  end if;

  insert into assignments (
    class_id, title, type, description, due_date, due_time, time_limit_minutes,
    target_word_count, image_url, reading_question_count, reading_questions_text,
    allow_audio_pause, auto_release_score, show_answer_review, reading_test_type,
    listening_audio_url, listening_exam_mode, listening_check_minutes)
  values (
    v_target.id, v_src.title, v_src.type, v_src.description, null, null,
    v_src.time_limit_minutes, v_src.target_word_count, v_src.image_url,
    v_src.reading_question_count, v_src.reading_questions_text, v_src.allow_audio_pause,
    v_src.auto_release_score, v_src.show_answer_review, v_src.reading_test_type,
    v_src.listening_audio_url,
    case when v_to_exam and v_src.listening_audio_url is not null then true else v_src.listening_exam_mode end,
    v_src.listening_check_minutes)
  returning id into v_new_a;

  for v_sec in select * from exam_sections where assignment_id = p_assignment_id order by order_index loop
    insert into exam_sections (
      assignment_id, title, order_index, passage_text, instruction, passage_title,
      audio_url, max_plays, image_url, task_number, speaking_part, documents)
    values (
      v_new_a, v_sec.title, v_sec.order_index, v_sec.passage_text, v_sec.instruction,
      v_sec.passage_title, v_sec.audio_url,
      case when v_to_exam and v_sec.audio_url is not null and v_sec.max_plays is null then 1 else v_sec.max_plays end,
      v_sec.image_url, v_sec.task_number, v_sec.speaking_part, v_sec.documents)
    returning id into v_new_s;

    for v_grp in select * from question_groups where section_id = v_sec.id order by order_index loop
      insert into question_groups (section_id, instruction, passage_text, order_index, image_url)
      values (v_new_s, v_grp.instruction, v_grp.passage_text, v_grp.order_index, v_grp.image_url)
      returning id into v_new_g;

      for v_link in
        select aq.order_index as pos, q.*
        from assignment_questions aq join questions q on q.id = aq.question_id
        where aq.group_id = v_grp.id
        order by aq.order_index
      loop
        insert into questions (teacher_id, type, skill, prompt, options, points)
        values (auth.uid(), v_link.type, v_link.skill, v_link.prompt, v_link.options, v_link.points)
        returning id into v_new_q;
        insert into question_answer_key (question_id, correct_answer)
        select v_new_q, k.correct_answer from question_answer_key k where k.question_id = v_link.id;
        insert into assignment_questions (section_id, group_id, question_id, order_index)
        values (v_new_s, v_new_g, v_new_q, v_link.pos);
      end loop;
    end loop;

    -- Filet : une question rattachee a la partie sans groupe.
    for v_link in
      select aq.order_index as pos, q.*
      from assignment_questions aq join questions q on q.id = aq.question_id
      where aq.section_id = v_sec.id and aq.group_id is null
      order by aq.order_index
    loop
      insert into questions (teacher_id, type, skill, prompt, options, points)
      values (auth.uid(), v_link.type, v_link.skill, v_link.prompt, v_link.options, v_link.points)
      returning id into v_new_q;
      insert into question_answer_key (question_id, correct_answer)
      select v_new_q, k.correct_answer from question_answer_key k where k.question_id = v_link.id;
      insert into assignment_questions (section_id, group_id, question_id, order_index)
      values (v_new_s, null, v_new_q, v_link.pos);
    end loop;
  end loop;

  if v_to_exam then
    select coalesce(max(order_index), 0) + 1 into v_next from exam_session_items where session_id = v_session;
    insert into exam_session_items (session_id, assignment_id, order_index)
    values (v_session, v_new_a, v_next);
  end if;

  return jsonb_build_object('assignment_id', v_new_a, 'class_id', v_target.id, 'session_id', v_session);
end $fn$;

-- duplicate_exam_session — Source : 16_exam_manage.sql
create or replace function public.duplicate_exam_session(p_session_id uuid, p_name text DEFAULT NULL::text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_src     record;
  v_code    text;
  v_try     integer := 0;
  v_class   uuid;
  v_session uuid;
  v_name    text;
  v_item    record;
  v_sec     record;
  v_grp     record;
  v_link    record;
  v_new_a   uuid;
  v_new_s   uuid;
  v_new_g   uuid;
  v_new_q   uuid;
  v_papers  integer := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_src from exam_sessions where id = p_session_id;
  if not found then raise exception 'Exam not found'; end if;
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;

  v_name := left(trim(coalesce(nullif(trim(p_name), ''), v_src.name || ' (copy)')), 120);

  loop
    v_try := v_try + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from classes where upper(code) = v_code)
          and not exists (select 1 from exam_sessions where upper(code) = v_code);
    if v_try > 20 then raise exception 'Could not allocate a code'; end if;
  end loop;

  insert into classes (name, teacher_id, code, kind)
  values (v_name, auth.uid(), 'EX-' || v_code, 'exam')
  returning id into v_class;

  insert into exam_sessions (name, code, container_class_id, created_by, strict_mode, listening_start)
  values (v_name, v_code, v_class, auth.uid(), v_src.strict_mode, v_src.listening_start)
  returning id into v_session;

  -- Celui qui duplique devient proprietaire ; l'equipe le suit.
  insert into exam_session_staff (session_id, teacher_id, role)
  values (v_session, auth.uid(), 'owner')
  on conflict do nothing;
  insert into exam_session_staff (session_id, teacher_id, role)
  select v_session, s.teacher_id, 'co'
  from exam_session_staff s
  where s.session_id = p_session_id and s.teacher_id <> auth.uid()
  on conflict do nothing;

  for v_item in
    select i.order_index as pos, a.*
    from exam_session_items i
    join assignments a on a.id = i.assignment_id
    where i.session_id = p_session_id
    order by i.order_index
  loop
    insert into assignments (
      class_id, title, type, description, due_date, due_time, time_limit_minutes,
      target_word_count, image_url, reading_question_count, reading_questions_text,
      allow_audio_pause, auto_release_score, show_answer_review, reading_test_type,
      listening_audio_url, listening_exam_mode, listening_check_minutes)
    values (
      v_class, v_item.title, v_item.type, v_item.description, v_item.due_date, v_item.due_time,
      v_item.time_limit_minutes, v_item.target_word_count, v_item.image_url,
      v_item.reading_question_count, v_item.reading_questions_text, v_item.allow_audio_pause,
      v_item.auto_release_score, v_item.show_answer_review, v_item.reading_test_type,
      v_item.listening_audio_url, v_item.listening_exam_mode, v_item.listening_check_minutes)
    returning id into v_new_a;

    insert into exam_session_items (session_id, assignment_id, order_index)
    values (v_session, v_new_a, v_item.pos);
    v_papers := v_papers + 1;

    for v_sec in select * from exam_sections where assignment_id = v_item.id order by order_index loop
      insert into exam_sections (
        assignment_id, title, order_index, passage_text, instruction, passage_title,
        audio_url, max_plays, image_url, task_number, speaking_part, documents)
      values (
        v_new_a, v_sec.title, v_sec.order_index, v_sec.passage_text, v_sec.instruction,
        v_sec.passage_title, v_sec.audio_url, v_sec.max_plays, v_sec.image_url,
        v_sec.task_number, v_sec.speaking_part, v_sec.documents)
      returning id into v_new_s;

      for v_grp in select * from question_groups where section_id = v_sec.id order by order_index loop
        insert into question_groups (section_id, instruction, passage_text, order_index, image_url)
        values (v_new_s, v_grp.instruction, v_grp.passage_text, v_grp.order_index, v_grp.image_url)
        returning id into v_new_g;

        for v_link in
          select aq.order_index as pos, q.*
          from assignment_questions aq
          join questions q on q.id = aq.question_id
          where aq.group_id = v_grp.id
          order by aq.order_index
        loop
          insert into questions (teacher_id, type, skill, prompt, options, points)
          values (auth.uid(), v_link.type, v_link.skill, v_link.prompt, v_link.options, v_link.points)
          returning id into v_new_q;

          insert into question_answer_key (question_id, correct_answer)
          select v_new_q, k.correct_answer from question_answer_key k where k.question_id = v_link.id;

          insert into assignment_questions (section_id, group_id, question_id, order_index)
          values (v_new_s, v_new_g, v_new_q, v_link.pos);
        end loop;
      end loop;

      -- Filet : une question rattachee a la partie sans groupe. Il n'y en
      -- a aucune aujourd'hui, mais rien ne doit disparaitre en silence.
      for v_link in
        select aq.order_index as pos, q.*
        from assignment_questions aq
        join questions q on q.id = aq.question_id
        where aq.section_id = v_sec.id and aq.group_id is null
        order by aq.order_index
      loop
        insert into questions (teacher_id, type, skill, prompt, options, points)
        values (auth.uid(), v_link.type, v_link.skill, v_link.prompt, v_link.options, v_link.points)
        returning id into v_new_q;
        insert into question_answer_key (question_id, correct_answer)
        select v_new_q, k.correct_answer from question_answer_key k where k.question_id = v_link.id;
        insert into assignment_questions (section_id, group_id, question_id, order_index)
        values (v_new_s, null, v_new_q, v_link.pos);
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('session_id', v_session, 'code', v_code, 'name', v_name, 'papers', v_papers);
end $fn$;

-- duplicate_targets — Source : 26_duplicate_assignment.sql
create or replace function public.duplicate_targets()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(jsonb_agg(t order by t->>'kind', t->>'name'), '[]'::jsonb)
  from (
    select jsonb_build_object('class_id', c.id, 'name', c.name, 'kind', 'class', 'session_id', null) t
    from classes c
    where c.teacher_id = auth.uid() and c.kind = 'class'
    union all
    select jsonb_build_object('class_id', e.container_class_id, 'name', e.name, 'kind', 'exam', 'session_id', e.id)
    from exam_sessions e
    where public.is_exam_staff(e.id)
      and e.opened_at is null
      and e.closed_at is null
      and e.results_released_at is null
      and not public.exam_is_open(e.id)
  ) x;
$fn$;

-- exam_allow_resume — Source : 18_invigilation.sql
create or replace function public.exam_allow_resume(p_session_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_n integer;
begin
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;

  update exam_incidents
     set cleared_at = now(), cleared_by = auth.uid()
   where session_id = p_session_id and student_id = p_student_id
     and freezes and cleared_at is null;
  get diagnostics v_n = row_count;

  return jsonb_build_object('resumed', v_n > 0);
end $fn$;

-- exam_explain_incident — Source : 18_invigilation.sql
create or replace function public.exam_explain_incident(p_assignment_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_student uuid := auth.uid(); v_session uuid; v_text text; v_n integer;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;
  v_text := left(trim(coalesce(p_reason, '')), 500);
  if length(v_text) < 3 then raise exception 'A reason is required'; end if;

  select i.session_id into v_session
  from exam_session_items i where i.assignment_id = p_assignment_id;
  if v_session is null then raise exception 'Not an exam paper'; end if;
  if not public.is_exam_candidate(v_session) then raise exception 'Not a candidate'; end if;

  update exam_incidents
     set reason = v_text
   where session_id = v_session and student_id = v_student
     and freezes and cleared_at is null;
  get diagnostics v_n = row_count;

  return jsonb_build_object('explained', v_n > 0);
end $fn$;

-- exam_invigilation_board — Source : 18_invigilation.sql
create or replace function public.exam_invigilation_board(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_out jsonb; v_class uuid;
begin
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;
  select container_class_id into v_class from exam_sessions where id = p_session_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'student_id', t.student_id,
        'name',       t.name,
        'frozen',     t.frozen_since is not null,
        'since',      t.frozen_since,
        'kind',       t.frozen_kind,
        'reason',     t.reason,
        'incidents',  t.incidents,
        'freezes',    t.freezes)
      order by t.frozen_since nulls last, t.name),
    '[]'::jsonb)
  into v_out
  from (
    select
      p.id   as student_id,
      p.name as name,
      (select min(x.at) from exam_incidents x
        where x.session_id = p_session_id and x.student_id = p.id
          and x.freezes and x.cleared_at is null) as frozen_since,
      (select x.kind from exam_incidents x
        where x.session_id = p_session_id and x.student_id = p.id
          and x.freezes and x.cleared_at is null order by x.at limit 1) as frozen_kind,
      (select x.reason from exam_incidents x
        where x.session_id = p_session_id and x.student_id = p.id
          and x.freezes and x.cleared_at is null and x.reason is not null
        order by x.at limit 1) as reason,
      (select count(*) from exam_incidents x
        where x.session_id = p_session_id and x.student_id = p.id) as incidents,
      (select count(*) from exam_incidents x
        where x.session_id = p_session_id and x.student_id = p.id and x.freezes) as freezes
    from roster r
    join profiles p on p.id = r.student_id
    where r.class_id = v_class
  ) as t;

  return v_out;
end $fn$;

-- exam_is_open — Source : 12_exam_sessions.sql
create or replace function public.exam_is_open(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from exam_sessions e
    where e.id = p_session_id
      and e.closed_at is null
      and (e.closes_at is null or now() < e.closes_at)
      and (e.opened_at is not null or (e.opens_at is not null and now() >= e.opens_at))
  );
$fn$;

-- exam_item_readable — Source : 16_exam_manage.sql
create or replace function public.exam_item_readable(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from exam_session_items i
    join exam_sessions e on e.id = i.session_id
    join roster r on r.class_id = e.container_class_id and r.student_id = auth.uid()
    where i.assignment_id = p_assignment_id
      and (
        e.results_released_at is not null
        or (
          public.exam_is_open(e.id)
          and not exists (
            select 1 from exam_session_items prev
            join assignments pa on pa.id = prev.assignment_id
            where prev.session_id = i.session_id
              and prev.order_index < i.order_index
              and pa.type <> 'Speaking'
              and not exists (select 1 from exam_attempts a
                              where a.assignment_id = prev.assignment_id
                                and a.student_id = auth.uid()
                                and a.submitted_at is not null)
          )
          and not exists (select 1 from exam_attempts a
                          where a.assignment_id = i.assignment_id
                            and a.student_id = auth.uid()
                            and a.submitted_at is not null)
        )
      )
  );
$fn$;

-- exam_item_startable — Source : 16_exam_manage.sql
create or replace function public.exam_item_startable(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from exam_session_items i
    join exam_sessions e on e.id = i.session_id
    join roster r on r.class_id = e.container_class_id and r.student_id = auth.uid()
    where i.assignment_id = p_assignment_id
      and e.results_released_at is null
      and public.exam_is_open(e.id)
      and not exists (
        select 1 from exam_session_items prev
        join assignments pa on pa.id = prev.assignment_id
        where prev.session_id = i.session_id
          and prev.order_index < i.order_index
          and pa.type <> 'Speaking'
          and not exists (select 1 from exam_attempts a
                          where a.assignment_id = prev.assignment_id
                            and a.student_id = auth.uid()
                            and a.submitted_at is not null)
      )
      and not exists (select 1 from exam_attempts a
                      where a.assignment_id = i.assignment_id
                        and a.student_id = auth.uid()
                        and a.submitted_at is not null)
  );
$fn$;

-- exam_live_content_guard — Source : 16_exam_manage.sql
create or replace function public.exam_live_content_guard()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_live boolean;
begin
  if tg_table_name = 'questions' then
    select exists (
      select 1
      from assignment_questions aq
      join exam_sections es     on es.id = aq.section_id
      join exam_session_items i on i.assignment_id = es.assignment_id
      join exam_sessions e      on e.id = i.session_id
      where aq.question_id = old.id
        and e.opened_at is not null and e.closed_at is null
    ) into v_live;
  else
    select exists (
      select 1
      from exam_session_items i
      join exam_sessions e on e.id = i.session_id
      where i.assignment_id = old.assignment_id
        and e.opened_at is not null and e.closed_at is null
    ) into v_live;
  end if;

  if v_live then
    raise exception 'This exam is running — close it before changing its papers';
  end if;
  return old;
end $fn$;

-- exam_my_invigilation — Source : 18_invigilation.sql
create or replace function public.exam_my_invigilation(p_assignment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_student uuid := auth.uid(); v_session uuid; v_strict boolean; v_row record;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;

  select e.id, e.strict_mode into v_session, v_strict
  from exam_session_items i join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;

  if v_session is null then
    -- Un devoir de classe ordinaire : aucune surveillance.
    return jsonb_build_object('watched', false, 'frozen', false, 'strict', false);
  end if;

  select x.at, x.kind, x.reason into v_row
  from exam_incidents x
  where x.session_id = v_session and x.student_id = v_student
    and x.freezes and x.cleared_at is null
  order by x.at limit 1;

  return jsonb_build_object(
    'watched', true,
    'strict', v_strict,
    'frozen', v_row.at is not null,
    'since', v_row.at,
    'kind', v_row.kind,
    'reason', v_row.reason,
    'session_id', v_session
  );
end $fn$;

-- exam_paper_release_guard — Source : 16_exam_manage.sql
create or replace function public.exam_paper_release_guard()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_is_exam boolean; v_released boolean;
begin
  if new.auto_release_score is not true then
    return new;
  end if;

  select (c.kind = 'exam') into v_is_exam from classes c where c.id = new.class_id;
  if not coalesce(v_is_exam, false) then
    return new;
  end if;

  select exists (
    select 1
    from exam_sessions e
    where e.container_class_id = new.class_id
      and e.results_released_at is not null
  ) into v_released;

  if not v_released then
    new.auto_release_score := false;
  end if;
  return new;
end $fn$;

-- exam_report_incident — Source : 18_invigilation.sql
create or replace function public.exam_report_incident(p_assignment_id uuid, p_kind text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_student uuid := auth.uid();
  v_session uuid;
  v_strict  boolean;
  v_open    boolean;
  v_freezes boolean;
  v_already boolean;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('fullscreen_exit','tab_switch','paste','context_menu','copy') then
    raise exception 'Unknown incident';
  end if;

  select e.id, e.strict_mode, public.exam_is_open(e.id)
    into v_session, v_strict, v_open
  from exam_session_items i
  join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;

  -- Pas une epreuve d'examen : il n'y a rien a surveiller.
  if v_session is null then return jsonb_build_object('frozen', false, 'watched', false); end if;

  if not public.is_exam_candidate(v_session) then raise exception 'Not a candidate'; end if;

  v_freezes := v_strict and v_open and p_kind in ('fullscreen_exit','tab_switch');

  select exists (select 1 from exam_incidents x
                 where x.session_id = v_session and x.student_id = v_student
                   and x.freezes and x.cleared_at is null)
    into v_already;

  -- Deja gele : on n'empile pas les gels, sinon un seul aller-retour en
  -- produirait dix et le prof devrait cliquer dix fois.
  if v_freezes and v_already then
    return jsonb_build_object('frozen', true, 'watched', true);
  end if;

  -- Anti-bavardage : le meme type d'incident dans les 5 dernieres
  -- secondes ne cree pas une deuxieme ligne.
  if exists (select 1 from exam_incidents x
             where x.session_id = v_session and x.student_id = v_student
               and x.kind = p_kind and x.at > now() - interval '5 seconds') then
    return jsonb_build_object('frozen', v_already, 'watched', true);
  end if;

  insert into exam_incidents (session_id, student_id, assignment_id, kind, freezes)
  values (v_session, v_student, p_assignment_id, p_kind, v_freezes);

  return jsonb_build_object('frozen', v_freezes or v_already, 'watched', true);
end $fn$;

-- exam_reset_audio — Source : 18_invigilation.sql
create or replace function public.exam_reset_audio(p_assignment_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_session uuid; v_n integer;
begin
  select i.session_id into v_session
  from exam_session_items i where i.assignment_id = p_assignment_id;
  if v_session is null then raise exception 'Not an exam paper'; end if;
  if not public.is_exam_staff(v_session) then raise exception 'Not allowed'; end if;

  delete from listening_plays
   where assignment_id = p_assignment_id and student_id = p_student_id;
  get diagnostics v_n = row_count;

  return jsonb_build_object('reset', v_n);
end $fn$;

-- exam_session_action — Source : 12_exam_sessions.sql
create or replace function public.exam_session_action(p_session_id uuid, p_action text, p_item_id uuid DEFAULT NULL::uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_now timestamptz := now();
begin
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;

  if p_action = 'open' then
    update exam_sessions set opened_at = coalesce(opened_at, v_now), closed_at = null where id = p_session_id;
  elsif p_action = 'close' then
    update exam_sessions set closed_at = v_now where id = p_session_id;
  elsif p_action = 'release' then
    update exam_sessions set results_released_at = coalesce(results_released_at, v_now) where id = p_session_id;
    -- Les epreuves de cette session publient leurs resultats.
    update assignments set auto_release_score = true
     where id in (select assignment_id from exam_session_items where session_id = p_session_id);
  elsif p_action = 'start_audio' then
    if p_item_id is null then raise exception 'Which part?'; end if;
    update exam_session_items set audio_started_at = coalesce(audio_started_at, v_now)
     where id = p_item_id and session_id = p_session_id;
  else
    raise exception 'Unknown action';
  end if;

  return jsonb_build_object('ok', true, 'at', v_now);
end $fn$;

-- exam_session_status — Source : 12_exam_sessions.sql
create or replace function public.exam_session_status(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_out jsonb; v_e record;
begin
  if not (public.is_exam_staff(p_session_id) or public.is_exam_candidate(p_session_id)) then
    raise exception 'Not allowed';
  end if;
  select * into v_e from exam_sessions where id = p_session_id;

  select jsonb_build_object(
    'session_id', v_e.id,
    'name', v_e.name,
    'is_staff', public.is_exam_staff(p_session_id),
    'is_open', public.exam_is_open(p_session_id),
    'opened_at', v_e.opened_at, 'closed_at', v_e.closed_at,
    'opens_at', v_e.opens_at, 'closes_at', v_e.closes_at,
    'strict_mode', v_e.strict_mode,
    'listening_start', v_e.listening_start,
    'results_released_at', v_e.results_released_at,
    'server_now', now(),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id,
        'assignment_id', i.assignment_id,
        'order_index', i.order_index,
        'title', a.title,
        'type', a.type,
        'minutes', a.time_limit_minutes,
        'audio_started_at', i.audio_started_at,
        'submitted', exists (select 1 from exam_attempts at
                             where at.assignment_id = i.assignment_id
                               and at.student_id = auth.uid() and at.submitted_at is not null),
        'started', exists (select 1 from exam_attempts at
                           where at.assignment_id = i.assignment_id and at.student_id = auth.uid()),
        'readable', public.exam_item_readable(i.assignment_id)
      ) order by i.order_index)
      from exam_session_items i join assignments a on a.id = i.assignment_id
      where i.session_id = p_session_id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $fn$;

-- exam_start_item — Source : 12_exam_sessions.sql
create or replace function public.exam_start_item(p_assignment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.exam_item_readable(p_assignment_id) then
    raise exception 'This part is not open yet';
  end if;
  return public.exam_timer_status(p_assignment_id, true);
end $fn$;

-- exam_timer_status — Source : 32_exam_page_reload.sql
create or replace function public.exam_timer_status(p_assignment_id uuid, p_start boolean, p_page uuid DEFAULT NULL::uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_student_id uuid := auth.uid();
  v_class_id   uuid;
  v_limit      integer;
  v_started    timestamptz;
  v_submitted  timestamptz;
  v_is_exam    boolean;
  v_session    uuid;
  v_strict     boolean;
  v_open       boolean;
  v_released   timestamptz;
  v_prev       uuid;
  v_already    boolean;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select class_id, time_limit_minutes into v_class_id, v_limit
  from assignments where id = p_assignment_id;
  if v_class_id is null then
    raise exception 'Assignment not found';
  end if;

  if not exists (select 1 from roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  if p_start then
    select (c.kind = 'exam') into v_is_exam from classes c where c.id = v_class_id;
    if coalesce(v_is_exam, false) and not public.exam_item_startable(p_assignment_id) then
      raise exception 'This part is not open';
    end if;

    -- The start time is written once, by the server clock. Calling this
    -- again (refresh, other device…) never changes it.
    insert into exam_attempts (assignment_id, student_id, started_at)
    values (p_assignment_id, v_student_id, now())
    on conflict (assignment_id, student_id) do nothing;
  end if;

  select started_at, submitted_at into v_started, v_submitted
  from exam_attempts
  where assignment_id = p_assignment_id and student_id = v_student_id;

  -- Livraison 47 : dans quel écran ce paper est-il ouvert ?
  if p_page is not null                      -- ancien site : pas de numéro, rien
     and v_started is not null               -- F5 avant Start : rien
     and v_submitted is null                 -- après la remise : rien
     and (v_limit is null or now() < v_started + make_interval(mins => v_limit))  -- temps écoulé : rien
  then
    select e.id, e.strict_mode, public.exam_is_open(e.id), e.results_released_at
      into v_session, v_strict, v_open, v_released
    from exam_session_items i
    join exam_sessions e on e.id = i.session_id
    where i.assignment_id = p_assignment_id;

    -- classe ordinaire, examen fermé ou résultats publiés : rien
    if v_session is not null and coalesce(v_open, false) and v_released is null then
      insert into exam_attempt_pages (assignment_id, student_id, page_token)
      values (p_assignment_id, v_student_id, p_page)
      on conflict (assignment_id, student_id) do nothing;

      -- FOUND = premier numéro enregistré (Start, ou épreuve commencée
      -- avant cette livraison) : adopté, pas de gel.
      if not found then
        select page_token into v_prev
        from exam_attempt_pages
        where assignment_id = p_assignment_id and student_id = v_student_id
        for update;

        if v_prev is distinct from p_page then
          -- Le paper a été rouvert dans un autre écran.
          update exam_attempt_pages
             set page_token = p_page, updated_at = now()
           where assignment_id = p_assignment_id and student_id = v_student_id;

          select exists (select 1 from exam_incidents x
                         where x.session_id = v_session and x.student_id = v_student_id
                           and x.freezes and x.cleared_at is null)
            into v_already;

          -- Gèle comme Échap (examen strict). Déjà gelé : on note sans
          -- empiler un deuxième gel, pour que le prof voie le compte.
          insert into exam_incidents (session_id, student_id, assignment_id, kind, freezes)
          values (v_session, v_student_id, p_assignment_id, 'page_reload',
                  coalesce(v_strict, false) and not v_already);
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'started_at', v_started,
    'server_now', now(),
    'time_limit_minutes', v_limit
  );
end;
$fn$;

-- get_paper — Source : 30_get_paper.sql
create or replace function public.get_paper(p_assignment_id uuid, p_with_keys boolean DEFAULT false)
returns jsonb
language sql
stable
set search_path = public
as $fn$
  with a as (
    select to_jsonb(x) as j
    from assignments x
    where x.id = p_assignment_id
  ),
  q as (
    select aq.group_id, aq.order_index, aq.question_id, to_jsonb(qq) as j
    from exam_sections s
    join question_groups g        on g.section_id = s.id
    join assignment_questions aq  on aq.group_id  = g.id
    join questions qq             on qq.id        = aq.question_id
    where s.assignment_id = p_assignment_id
  )
  select case when not exists (select 1 from a) then null else
    jsonb_build_object(
      'assignment', (select j from a),
      'sections', coalesce((
        select jsonb_agg(
                 to_jsonb(s) || jsonb_build_object('groups', coalesce((
                   select jsonb_agg(
                            to_jsonb(g) || jsonb_build_object('questions', coalesce((
                              select jsonb_agg(q.j order by q.order_index, q.question_id)
                              from q where q.group_id = g.id
                            ), '[]'::jsonb))
                            order by g.order_index, g.id)
                   from question_groups g
                   where g.section_id = s.id
                 ), '[]'::jsonb))
                 order by s.order_index, s.id)
        from exam_sections s
        where s.assignment_id = p_assignment_id
      ), '[]'::jsonb),
      'answer_keys', case when p_with_keys then coalesce((
        select jsonb_object_agg(k.question_id, k.correct_answer)
        from question_answer_key k
        where k.question_id in (select question_id from q)
      ), '{}'::jsonb) else null end
    )
  end;
$fn$;

-- grade_student_answer — Source : 21_answer_matching.sql
create or replace function public.grade_student_answer(p_question_id uuid, p_response jsonb)
returns TABLE(is_correct boolean, points_earned numeric, points_possible numeric)
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_correct jsonb;
  v_type text;
  v_points_possible numeric;
  v_points_earned numeric;
  v_is_correct boolean;
  v_response_text text;
  v_accepted text[];
  v_correct_letters text[];
  v_response_letters text[];
begin
  select k.correct_answer, q.type, coalesce(q.points, 1)
    into v_correct, v_type, v_points_possible
  from public.question_answer_key k
  join public.questions q on q.id = k.question_id
  where k.question_id = p_question_id;

  if v_type = 'gap_fill' then
    -- MEME normalisation des deux cotes : ce que l'etudiant a tape et ce
    -- que le prof a enregistre. Une cle sale ne peut donc plus faire
    -- perdre un point, meme si une autre s'infiltre un jour.
    v_response_text := public.normalize_answer_text(coalesce(p_response #>> '{}', ''));

    select array_agg(public.normalize_answer_text(x)) into v_accepted
    from jsonb_array_elements_text(coalesce(v_correct, '[]'::jsonb)) as x;

    v_is_correct := v_response_text <> '' and v_response_text = any(v_accepted);
    v_points_earned := case when v_is_correct then v_points_possible else 0 end;

  elsif v_type = 'multiple_selection' then
    select array_agg(x) into v_correct_letters from jsonb_array_elements_text(coalesce(v_correct, '[]'::jsonb)) as x;
    select array_agg(x) into v_response_letters from jsonb_array_elements_text(coalesce(p_response, '[]'::jsonb)) as x;
    select count(*) into v_points_earned
    from unnest(coalesce(v_response_letters, '{}'::text[])) as r
    where r = any(coalesce(v_correct_letters, '{}'::text[]));
    v_points_earned := least(v_points_earned, v_points_possible);
    v_is_correct := v_points_earned = v_points_possible;

  else
    v_is_correct := (v_correct is not null and v_correct = p_response);
    v_points_earned := case when v_is_correct then v_points_possible else 0 end;
  end if;

  return query select v_is_correct, v_points_earned, v_points_possible;
end;
$fn$;

-- handle_new_user — Source : (aucun script : créée avant le 09)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'User'),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  );
  return new;
end;
$fn$;

-- is_assignment_teacher — Source : 10_rls_copies_classes.sql
create or replace function public.is_assignment_teacher(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from assignments a join classes c on c.id = a.class_id
                 where a.id = p_assignment_id and c.teacher_id = auth.uid());
$fn$;

-- is_class_teacher — Source : 12_exam_sessions.sql
create or replace function public.is_class_teacher(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from classes c where c.id = p_class_id and c.teacher_id = auth.uid())
      or exists (select 1 from exam_sessions e
                 where e.container_class_id = p_class_id and public.is_exam_staff(e.id));
$fn$;

-- is_enrolled — Source : 10_rls_copies_classes.sql
create or replace function public.is_enrolled(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from roster r where r.class_id = p_class_id and r.student_id = auth.uid());
$fn$;

-- is_exam_candidate — Source : 12_exam_sessions.sql
create or replace function public.is_exam_candidate(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from exam_sessions e
                 join roster r on r.class_id = e.container_class_id
                 where e.id = p_session_id and r.student_id = auth.uid());
$fn$;

-- is_exam_container_staff — Source : 20_exam_staff_content.sql
create or replace function public.is_exam_container_staff(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from exam_sessions e
    join exam_session_staff s on s.session_id = e.id
    where e.container_class_id = p_class_id
      and s.teacher_id = auth.uid()
  );
$fn$;

-- is_exam_staff — Source : 12_exam_sessions.sql
create or replace function public.is_exam_staff(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from exam_session_staff s
                 where s.session_id = p_session_id and s.teacher_id = auth.uid());
$fn$;

-- is_exam_staff_of_assignment — Source : 16_exam_manage.sql
create or replace function public.is_exam_staff_of_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from exam_session_items i
    join exam_session_staff s on s.session_id = i.session_id
    where i.assignment_id = p_assignment_id
      and s.teacher_id = auth.uid()
  );
$fn$;

-- is_exam_staff_of_question — Source : 16_exam_manage.sql
create or replace function public.is_exam_staff_of_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from assignment_questions aq
    join exam_sections es        on es.id = aq.section_id
    join exam_session_items i    on i.assignment_id = es.assignment_id
    join exam_session_staff s    on s.session_id = i.session_id
    where aq.question_id = p_question_id
      and s.teacher_id = auth.uid()
  );
$fn$;

-- join_class — Source : 12_exam_sessions.sql
create or replace function public.join_class(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_id uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_code is null or length(trim(p_code)) < 3 or length(trim(p_code)) > 12 then
    raise exception 'Invalid code';
  end if;
  select id, name into v_id, v_name from classes
   where upper(code) = upper(trim(p_code)) and kind = 'class';
  if v_id is null then raise exception 'No class found with that code'; end if;
  insert into roster(class_id, student_id) values (v_id, auth.uid()) on conflict do nothing;
  return jsonb_build_object('class_id', v_id, 'name', v_name);
end $fn$;

-- join_exam — Source : 12_exam_sessions.sql
create or replace function public.join_exam(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_session uuid; v_class uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_code is null or length(trim(p_code)) < 4 or length(trim(p_code)) > 12 then
    raise exception 'Invalid code';
  end if;
  select e.id, e.container_class_id, e.name into v_session, v_class, v_name
  from exam_sessions e where upper(e.code) = upper(trim(p_code));
  if v_session is null then raise exception 'No exam found with that code'; end if;
  if not public.exam_is_open(v_session) then raise exception 'This exam is not open yet'; end if;

  insert into roster (class_id, student_id) values (v_class, auth.uid()) on conflict do nothing;
  return jsonb_build_object('session_id', v_session, 'name', v_name);
end $fn$;

-- list_invitable_teachers — Source : 17_invite_teacher.sql
create or replace function public.list_invitable_teachers(p_session_id uuid)
returns TABLE(id uuid, name text)
language sql
stable
security definer
set search_path = public
as $fn$
  select p.id, p.name
  from profiles p
  where public.is_exam_staff(p_session_id)          -- la porte
    and p.role = 'teacher'
    and p.id <> auth.uid()
    and not exists (select 1 from exam_session_staff s
                    where s.session_id = p_session_id and s.teacher_id = p.id)
  order by p.name;
$fn$;

-- listening_audio_status — Source : (aucun script : créée avant le 09)
create or replace function public.listening_audio_status(p_assignment_id uuid, p_start boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_student_id uuid := auth.uid();
  v_class_id   uuid;
  v_audio      text;
  v_exam_mode  boolean;
  v_check_min  integer;
  v_started    timestamptz;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select class_id, listening_audio_url, listening_exam_mode, listening_check_minutes
    into v_class_id, v_audio, v_exam_mode, v_check_min
  from assignments where id = p_assignment_id;

  if v_class_id is null then
    raise exception 'Assignment not found';
  end if;

  -- L'étudiant doit être inscrit dans la classe du devoir.
  if not exists (select 1 from roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  if p_start and v_audio is not null then
    -- La ligne de tentative existe peut-être déjà (minuteur).
    insert into exam_attempts (assignment_id, student_id, started_at)
    values (p_assignment_id, v_student_id, now())
    on conflict (assignment_id, student_id) do nothing;

    -- L'heure de départ n'est écrite QU'UNE FOIS : rafraîchir la page,
    -- ou rouvrir le devoir sur un autre appareil, ne la change jamais.
    update exam_attempts
       set audio_started_at = now()
     where assignment_id = p_assignment_id
       and student_id = v_student_id
       and audio_started_at is null;
  end if;

  select audio_started_at into v_started
  from exam_attempts
  where assignment_id = p_assignment_id and student_id = v_student_id;

  return jsonb_build_object(
    'audio_started_at', v_started,
    'server_now', now(),
    'exam_mode', coalesce(v_exam_mode, false),
    'check_minutes', coalesce(v_check_min, 2)
  );
end;
$fn$;

-- normalize_answer_text — Source : 21_answer_matching.sql
create or replace function public.normalize_answer_text(p_text text)
returns text
language sql
immutable
set search_path = public
as $fn$
  select btrim(
    regexp_replace(                                   -- 5) espaces -> un seul
      regexp_replace(                                 -- 4) tirets -> "-"
        regexp_replace(                               -- 3) guillemets -> '"'
          regexp_replace(                             -- 2) apostrophes -> "'"
            regexp_replace(                           -- 1) invisibles -> rien
              lower(coalesce(p_text, '')),
              '[​-‏⁠﻿­]', '', 'g'),
            '[‘’‛′]', '''', 'g'),
          '[“”″]', '"', 'g'),
        '[‐-―−]', '-', 'g'),
      '[\s   　]+', ' ', 'g')
  );
$fn$;

-- paper_blank_count — Source : 27_paper_editor.sql
create or replace function public.paper_blank_count(p_text text)
returns integer
language sql
immutable
set search_path = public
as $fn$
  select count(*)::integer from regexp_matches(coalesce(p_text, ''), '_{3,}', 'g');
$fn$;

-- paper_edit_state — Source : 27_paper_editor.sql
create or replace function public.paper_edit_state(p_assignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_a        record;
  v_sub      integer;
  v_seen     boolean;
  v_live     boolean;
  v_released boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select a.id, a.auto_release_score, c.teacher_id into v_a
  from assignments a join classes c on c.id = a.class_id
  where a.id = p_assignment_id;
  if not found or v_a.teacher_id is distinct from auth.uid() then
    raise exception 'Not allowed';
  end if;

  select count(*) into v_sub from (
    select student_id from student_answers where assignment_id = p_assignment_id
    union
    select student_id from exam_attempts where assignment_id = p_assignment_id and submitted_at is not null
  ) x;

  select exists (
    select 1 from exam_session_items i join exam_sessions e on e.id = i.session_id
    where i.assignment_id = p_assignment_id and e.results_released_at is not null
  ) into v_released;

  v_seen := v_sub > 0 and (
    coalesce(v_a.auto_release_score, false)
    or v_released
    or exists (select 1 from assignment_feedback f
               where f.assignment_id = p_assignment_id and f.released_at is not null)
  );

  select exists (
    select 1 from exam_session_items i join exam_sessions e on e.id = i.session_id
    where i.assignment_id = p_assignment_id
      and ((e.opened_at is not null and e.closed_at is null) or public.exam_is_open(e.id))
  ) into v_live;

  return jsonb_build_object(
    'level', case when v_sub = 0 then 1 when v_seen then 3 else 2 end,
    'submitted', v_sub,
    'marks_seen', v_seen,
    'exam_live', v_live);
end $fn$;

-- paper_json_shape — Source : 27_paper_editor.sql
create or replace function public.paper_json_shape(p jsonb, p_key text DEFAULT NULL::text)
returns jsonb
language sql
immutable
set search_path = public
as $fn$
  select case jsonb_typeof(p)
    when 'object' then coalesce(
      (select jsonb_object_agg(k, public.paper_json_shape(v, k)) from jsonb_each(p) as e(k, v)),
      '{}'::jsonb)
    when 'array' then coalesce(
      (select jsonb_agg(public.paper_json_shape(v, p_key) order by i) from jsonb_array_elements(p) with ordinality as a(v, i)),
      '[]'::jsonb)
    when 'string' then
      case when p_key in ('style', 'type', 'letter', 'label_set', 'kind') then p else '""'::jsonb end
    else p
  end;
$fn$;

-- paper_own_file — Source : 28_paper_editor_delete_media.sql
create or replace function public.paper_own_file(p_value text, p_folder text)
returns boolean
language sql
stable
set search_path = public
as $fn$
  select p_value is not null
     and position('..' in p_value) = 0
     and regexp_replace(p_value, '^https://bwfynibzijxuiitmdrtw\.supabase\.co/storage/v1/object/public/assignment-files/', '')
         like p_folder || '/' || auth.uid()::text || '/%';
$fn$;

-- readable_paper_ids — Source : 31_lock_content_reads.sql
create or replace function public.readable_paper_ids()
returns SETOF uuid
language sql
stable
security definer
set search_path = public
as $fn$
  -- papers des classes où elle est prof, inscrite, ou prof invitée,
  -- gardés seulement s'ils sont lisibles (verrous d'examen compris)
  select a.id
  from assignments a
  where a.class_id in (
          select c.id from classes c where c.teacher_id = auth.uid()
          union
          select r.class_id from roster r where r.student_id = auth.uid()
          union
          select e.container_class_id
          from exam_sessions e
          join exam_session_staff st on st.session_id = e.id
          where st.teacher_id = auth.uid()
        )
    and public.can_read_assignment(a.id)
  union
  -- prof invité : les épreuves de ses sessions (script 20)
  select i.assignment_id
  from exam_session_items i
  join exam_session_staff st on st.session_id = i.session_id
  where st.teacher_id = auth.uid();
$fn$;

-- readable_question_ids — Source : 31_lock_content_reads.sql
create or replace function public.readable_question_ids()
returns SETOF uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select aq.question_id
  from assignment_questions aq
  join exam_sections s on s.id = aq.section_id
  where s.assignment_id in (select public.readable_paper_ids());
$fn$;

-- readable_section_ids — Source : 31_lock_content_reads.sql
create or replace function public.readable_section_ids()
returns SETOF uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select s.id
  from exam_sections s
  where s.assignment_id in (select public.readable_paper_ids());
$fn$;

-- record_audio_play — Source : (aucun script : créée avant le 09)
create or replace function public.record_audio_play(p_assignment_id uuid, p_section_id uuid, p_max_plays integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_student_id uuid := auth.uid();
  v_current integer;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into listening_plays (assignment_id, student_id, section_id, plays_used)
  values (p_assignment_id, v_student_id, p_section_id, 0)
  on conflict (assignment_id, student_id, section_id) do nothing;

  select plays_used into v_current
  from listening_plays
  where assignment_id = p_assignment_id and student_id = v_student_id and section_id = p_section_id
  for update;

  if p_max_plays is not null and v_current >= p_max_plays then
    return jsonb_build_object('allowed', false, 'plays_used', v_current);
  end if;

  update listening_plays
  set plays_used = plays_used + 1
  where assignment_id = p_assignment_id and student_id = v_student_id and section_id = p_section_id
  returning plays_used into v_current;

  return jsonb_build_object('allowed', true, 'plays_used', v_current);
end;
$fn$;

-- rename_exam_session — Source : 16_exam_manage.sql
create or replace function public.rename_exam_session(p_session_id uuid, p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare v_name text; v_class uuid;
begin
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;
  v_name := left(trim(coalesce(p_name, '')), 120);
  if length(v_name) = 0 then raise exception 'A name is required'; end if;

  update exam_sessions set name = v_name where id = p_session_id
  returning container_class_id into v_class;
  update classes set name = v_name where id = v_class;

  return jsonb_build_object('name', v_name);
end $fn$;

-- save_paper_edits — Source : 29_paper_editor_add_groups.sql
create or replace function public.save_paper_edits(p_assignment_id uuid, p_edits jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_state    jsonb;
  v_level    integer;
  v_e        jsonb;
  v_id       uuid;
  v_old      record;
  v_new_text text;
  v_new_json jsonb;
  v_key      jsonb;
  v_old_key  jsonb;
  v_type     text;
  v_letters  text[];
  v_changed  integer := 0;
  v_keys     integer := 0;
  v_remarked integer := 0;
  v_deleted  integer := 0;
  v_ans      record;
  v_g        record;
  v_n        integer;
  v_val      text;
  v_added    integer := 0;
  v_qids     uuid[];
  v_gid      uuid;
begin
  v_state := public.paper_edit_state(p_assignment_id);   -- verifie aussi le proprietaire
  if (v_state->>'exam_live')::boolean then
    raise exception 'This exam is running: the paper cannot be changed now';
  end if;
  v_level := (v_state->>'level')::integer;

  if p_edits is null or jsonb_typeof(p_edits) <> 'object' or length(p_edits::text) > 500000 then
    raise exception 'Invalid edits';
  end if;

  -- ---------- Suppressions (niveau 1 seulement) ----------
  if jsonb_array_length(coalesce(p_edits->'delete_groups', '[]'::jsonb)) > 0
     or jsonb_array_length(coalesce(p_edits->'delete_questions', '[]'::jsonb)) > 0 then
    if v_level <> 1 then
      raise exception 'Questions can only be removed while nobody has handed in this paper';
    end if;

    for v_e in select * from jsonb_array_elements(coalesce(p_edits->'delete_groups', '[]'::jsonb)) loop
      v_id := (v_e #>> '{}')::uuid;
      if not exists (select 1 from question_groups g join exam_sections s on s.id = g.section_id
                     where g.id = v_id and s.assignment_id = p_assignment_id) then
        raise exception 'Question group not in this paper';
      end if;
      delete from questions q
      where q.id in (select aq.question_id from assignment_questions aq where aq.group_id = v_id);
      delete from assignment_questions where group_id = v_id;
      delete from question_groups where id = v_id;
      v_deleted := v_deleted + 1;
    end loop;

    for v_e in select * from jsonb_array_elements(coalesce(p_edits->'delete_questions', '[]'::jsonb)) loop
      v_id := (v_e #>> '{}')::uuid;
      if not exists (select 1 from assignment_questions aq join exam_sections s on s.id = aq.section_id
                     where aq.question_id = v_id and s.assignment_id = p_assignment_id) then
        raise exception 'Question not in this paper';
      end if;
      delete from assignment_questions where question_id = v_id;
      delete from questions where id = v_id;
      v_deleted := v_deleted + 1;
    end loop;
  end if;

  -- ---------- Nouveaux groupes (niveau 1 seulement) ----------
  -- Les questions ont deja ete creees par les outils de l'ecran de creation
  -- (comme quand on construit un paper) ; ici on les RATTACHE au paper.
  if jsonb_array_length(coalesce(p_edits->'add_groups', '[]'::jsonb)) > 0 then
    if v_level <> 1 then
      raise exception 'New questions can only be added while nobody has handed in this paper';
    end if;
    if jsonb_array_length(p_edits->'add_groups') > 20 then
      raise exception 'Too many new groups at once';
    end if;
    for v_e in select * from jsonb_array_elements(p_edits->'add_groups') loop
      v_id := (v_e->>'section_id')::uuid;
      if not exists (select 1 from exam_sections where id = v_id and assignment_id = p_assignment_id) then
        raise exception 'Part not in this paper';
      end if;
      if jsonb_typeof(v_e->'question_ids') <> 'array' then
        raise exception 'A new group needs its questions';
      end if;
      select array_agg((x #>> '{}')::uuid order by i) into v_qids
      from jsonb_array_elements(v_e->'question_ids') with ordinality as t(x, i);
      if coalesce(array_length(v_qids, 1), 0) = 0 or array_length(v_qids, 1) > 60 then
        raise exception 'A new group needs between 1 and 60 questions';
      end if;
      if (select count(distinct q) from unnest(v_qids) q) <> array_length(v_qids, 1) then
        raise exception 'The same question cannot be added twice';
      end if;
      if exists (
        select 1 from unnest(v_qids) as u(qid)
        where not exists (
          select 1 from questions q
          where q.id = u.qid
            and q.teacher_id = auth.uid()
            and q.type in ('gap_fill', 'multiple_choice', 'multiple_selection', 'true_false_not_given',
                           'matching_features', 'matching_information', 'matching_map_labelling',
                           'matching_headings', 'matching_sentence_endings'))
           or exists (select 1 from assignment_questions aq where aq.question_id = u.qid)
           or not exists (select 1 from question_answer_key k where k.question_id = u.qid)
      ) then
        raise exception 'A new question is not yours, is already in a paper, or has no correct answer';
      end if;
      v_val := nullif(v_e->>'image_url', '');
      if v_val is not null and not public.paper_own_file(v_val, 'images') then
        raise exception 'Upload the picture again from this screen';
      end if;
      v_new_text := nullif(v_e->>'passage_text', '');
      if v_new_text is not null and left(ltrim(v_new_text), 1) = '{' then
        begin
          v_new_json := v_new_text::jsonb;
        exception when others then
          raise exception 'The layout of the new group was damaged';
        end;
      end if;

      insert into question_groups (section_id, instruction, passage_text, image_url, order_index)
      values (v_id, nullif(left(coalesce(v_e->>'instruction', ''), 4000), ''), v_new_text, v_val,
              coalesce((select max(order_index) + 1 from question_groups where section_id = v_id), 0))
      returning id into v_gid;

      insert into assignment_questions (section_id, group_id, question_id, order_index)
      select v_id, v_gid, u.qid, (u.i - 1)::integer
      from unnest(v_qids) with ordinality as u(qid, i);
      v_added := v_added + 1;
    end loop;
  end if;

  -- ---------- Parties ----------
  for v_e in select * from jsonb_array_elements(coalesce(p_edits->'sections', '[]'::jsonb)) loop
    v_id := (v_e->>'id')::uuid;
    select * into v_old from exam_sections where id = v_id and assignment_id = p_assignment_id;
    if not found then raise exception 'Part not in this paper'; end if;
    if v_e ? 'passage_text' and public.paper_blank_count(v_e->>'passage_text') <> public.paper_blank_count(v_old.passage_text) then
      raise exception 'A passage must keep the same number of blanks';
    end if;
    if v_e ? 'audio_url' then
      v_val := v_e->>'audio_url';
      if v_val is not null and v_val is distinct from v_old.audio_url and not public.paper_own_file(v_val, 'audio') then
        raise exception 'Choose a recording from your own audio library';
      end if;
    end if;
    if v_e ? 'max_plays' and v_e->'max_plays' <> 'null'::jsonb then
      if jsonb_typeof(v_e->'max_plays') <> 'number' or (v_e->>'max_plays')::numeric not between 1 and 20
         or (v_e->>'max_plays')::numeric <> trunc((v_e->>'max_plays')::numeric) then
        raise exception 'Plays allowed must be a whole number between 1 and 20, or empty for unlimited';
      end if;
    end if;
    update exam_sections set
      passage_title = case when v_e ? 'passage_title' then nullif(left(v_e->>'passage_title', 300), '') else passage_title end,
      passage_text  = case when v_e ? 'passage_text'  then v_e->>'passage_text' else passage_text end,
      audio_url     = case when v_e ? 'audio_url'     then v_e->>'audio_url' else audio_url end,
      max_plays     = case when v_e ? 'max_plays'     then (v_e->>'max_plays')::integer else max_plays end
    where id = v_id;
    v_changed := v_changed + 1;
  end loop;

  -- ---------- Groupes ----------
  for v_e in select * from jsonb_array_elements(coalesce(p_edits->'groups', '[]'::jsonb)) loop
    v_id := (v_e->>'id')::uuid;
    select g.* into v_old from question_groups g join exam_sections s on s.id = g.section_id
    where g.id = v_id and s.assignment_id = p_assignment_id;
    if not found then raise exception 'Question group not in this paper'; end if;
    if v_e ? 'passage_text' then
      v_new_text := v_e->>'passage_text';
      if public.paper_blank_count(v_old.passage_text) = 0 and public.paper_blank_count(v_new_text) > 0 then
        raise exception 'Blanks cannot be added to this text';
      end if;
      if left(ltrim(coalesce(v_old.passage_text, '')), 1) = '{' then
        begin
          v_new_json := v_new_text::jsonb;
        exception when others then
          raise exception 'The layout of this group was damaged';
        end;
        if public.paper_json_shape(v_new_json) <> public.paper_json_shape(v_old.passage_text::jsonb) then
          raise exception 'The layout of this group cannot change, only its words';
        end if;
      end if;
    end if;
    if v_e ? 'image_url' then
      v_val := v_e->>'image_url';
      if v_val is not null and v_val is distinct from v_old.image_url and not public.paper_own_file(v_val, 'images') then
        raise exception 'Upload the picture again from this screen';
      end if;
    end if;
    update question_groups set
      instruction  = case when v_e ? 'instruction' then nullif(v_e->>'instruction', '') else instruction end,
      passage_text = case when v_e ? 'passage_text' then v_e->>'passage_text' else passage_text end,
      image_url    = case when v_e ? 'image_url' then v_e->>'image_url' else image_url end
    where id = v_id;
    v_changed := v_changed + 1;
  end loop;

  -- ---------- Questions (inchange depuis 27) ----------
  for v_e in select * from jsonb_array_elements(coalesce(p_edits->'questions', '[]'::jsonb)) loop
    v_id := (v_e->>'id')::uuid;
    select q.* into v_old from questions q
    where q.id = v_id
      and exists (select 1 from assignment_questions aq join exam_sections s on s.id = aq.section_id
                  where aq.question_id = q.id and s.assignment_id = p_assignment_id);
    if not found then raise exception 'Question not in this paper'; end if;
    v_type := v_old.type;

    if v_e ? 'prompt' and public.paper_blank_count(v_e->>'prompt') <> public.paper_blank_count(v_old.prompt) then
      raise exception 'A question must keep the same number of blanks';
    end if;
    if v_e ? 'options' then
      if jsonb_typeof(v_e->'options') <> 'object'
         or public.paper_json_shape(v_e->'options') <> public.paper_json_shape(v_old.options) then
        raise exception 'The choices of a question cannot be added, removed or re-lettered, only reworded';
      end if;
    end if;
    update questions set
      prompt  = case when v_e ? 'prompt' then v_e->>'prompt' else prompt end,
      options = case when v_e ? 'options' then v_e->'options' else options end
    where id = v_id;
    v_changed := v_changed + 1;

    if v_e ? 'correct_answer' then
      v_key := v_e->'correct_answer';
      select correct_answer into v_old_key from question_answer_key where question_id = v_id;
      if v_old_key is distinct from v_key then
        if v_level = 3 then
          raise exception 'Some students have already seen their mark: the correct answers can no longer be changed';
        end if;
        select array_agg(c->>'letter') into v_letters
        from jsonb_array_elements(coalesce((select options from questions where id = v_id)->'choices', '[]'::jsonb)) c;

        if v_type = 'gap_fill' then
          if jsonb_typeof(v_key) <> 'array' or jsonb_array_length(v_key) < 1 or jsonb_array_length(v_key) > 10
             or exists (select 1 from jsonb_array_elements(v_key) x
                        where jsonb_typeof(x) <> 'string' or btrim(x #>> '{}') = '' or length(x #>> '{}') > 200) then
            raise exception 'A gap needs between 1 and 10 accepted answers';
          end if;
          select jsonb_agg(btrim(x #>> '{}')) into v_key from jsonb_array_elements(v_key) x;
        elsif v_type = 'multiple_selection' then
          if jsonb_typeof(v_key) <> 'array'
             or jsonb_array_length(v_key) <> jsonb_array_length(coalesce(v_old_key, '[]'::jsonb))
             or exists (select 1 from jsonb_array_elements_text(v_key) x where not (x = any(v_letters)))
             or (select count(distinct x) from jsonb_array_elements_text(v_key) x) <> jsonb_array_length(v_key) then
            raise exception 'Choose the same number of different correct letters';
          end if;
        elsif v_type = 'true_false_not_given' then
          if jsonb_typeof(v_key) <> 'string' or not ((v_key #>> '{}') = any (array['positive', 'negative', 'not_given'])) then
            raise exception 'Invalid answer';
          end if;
        else
          if jsonb_typeof(v_key) <> 'string' or not ((v_key #>> '{}') = any (v_letters)) then
            raise exception 'The correct answer must be one of the letters of this question';
          end if;
        end if;

        insert into question_answer_key (question_id, correct_answer) values (v_id, v_key)
        on conflict (question_id) do update set correct_answer = excluded.correct_answer;
        v_keys := v_keys + 1;

        for v_ans in select id, response from student_answers where question_id = v_id loop
          select * into v_g from public.grade_student_answer(v_id, v_ans.response);
          update student_answers set is_correct = v_g.is_correct, points_earned = v_g.points_earned
          where id = v_ans.id;
          v_remarked := v_remarked + 1;
        end loop;
      end if;
    end if;
  end loop;

  -- ---------- Le paper doit rester coherent ----------
  if not exists (select 1 from exam_sections where assignment_id = p_assignment_id) then
    raise exception 'The paper must keep at least one part';
  end if;
  if exists (select 1 from exam_sections s where s.assignment_id = p_assignment_id
             and not exists (select 1 from question_groups g where g.section_id = s.id)) then
    raise exception 'Each part must keep at least one question group';
  end if;
  for v_g in
    select g.id, g.passage_text, g.image_url,
           (select count(*) from assignment_questions aq where aq.group_id = g.id) as n,
           exists (select 1 from assignment_questions aq join questions q on q.id = aq.question_id
                   where aq.group_id = g.id and q.type = 'matching_map_labelling') as labelling
    from question_groups g join exam_sections s on s.id = g.section_id
    where s.assignment_id = p_assignment_id
  loop
    if v_g.n = 0 then
      raise exception 'A question group cannot be left empty: remove the whole group instead';
    end if;
    v_n := public.paper_blank_count(v_g.passage_text);
    if v_n > 0 and v_n <> v_g.n then
      raise exception 'Each question of a text with blanks needs its own "___": % blanks for % questions', v_n, v_g.n;
    end if;
    if v_g.labelling and v_g.image_url is null then
      raise exception 'A map or plan labelling group needs its picture';
    end if;
  end loop;

  return jsonb_build_object('changed', v_changed, 'deleted', v_deleted, 'added', v_added, 'keys_changed', v_keys,
                            'answers_remarked', v_remarked, 'level', v_level);
end $fn$;

-- save_writing_draft — Source : (aucun script : créée avant le 09)
create or replace function public.save_writing_draft(p_section_id uuid, p_content_html text, p_word_count integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_student_id    uuid := auth.uid();
  v_assignment_id uuid;
  v_class_id      uuid;
  v_type          text;
  v_task          smallint;
  v_limit         integer;
  v_started       timestamptz;
  v_submitted     timestamptz;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select s.assignment_id, s.task_number, a.class_id, a.type, a.time_limit_minutes
    into v_assignment_id, v_task, v_class_id, v_type, v_limit
  from exam_sections s
  join assignments a on a.id = s.assignment_id
  where s.id = p_section_id;

  if v_assignment_id is null or v_type <> 'Writing' or v_task is null then
    raise exception 'Not a Writing task';
  end if;

  if not exists (select 1 from roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  if length(coalesce(p_content_html, '')) > 200000 then
    raise exception 'Text too long';
  end if;

  select submitted_at into v_submitted
  from writing_responses
  where section_id = p_section_id and student_id = v_student_id;
  if v_submitted is not null then
    return jsonb_build_object('saved', false, 'reason', 'submitted');
  end if;

  if v_limit is not null then
    select started_at into v_started
    from exam_attempts
    where assignment_id = v_assignment_id and student_id = v_student_id;
    if v_started is null then
      return jsonb_build_object('saved', false, 'reason', 'not_started');
    end if;
    if now() > v_started + make_interval(mins => v_limit + 5) then
      return jsonb_build_object('saved', false, 'reason', 'time');
    end if;
  end if;

  insert into writing_responses (assignment_id, section_id, student_id, content_html, word_count)
  values (v_assignment_id, p_section_id, v_student_id, coalesce(p_content_html, ''),
          greatest(0, least(coalesce(p_word_count, 0), 100000)))
  on conflict (section_id, student_id) do update
    set content_html = excluded.content_html,
        word_count   = excluded.word_count,
        updated_at   = now()
    where writing_responses.submitted_at is null;

  return jsonb_build_object('saved', true);
end;
$fn$;

-- shares_class_with — Source : 11_rls_storage_profiles.sql
create or replace function public.shares_class_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from classes c join roster r on r.class_id = c.id
                 where c.teacher_id = auth.uid() and r.student_id = p_user_id)
      or exists (select 1 from roster r join classes c on c.id = r.class_id
                 where r.student_id = auth.uid() and c.teacher_id = p_user_id);
$fn$;

-- shares_exam_with — Source : 19_exam_staff_names.sql
create or replace function public.shares_exam_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  -- je suis prof de la session, l'autre y est candidat
  select exists (
    select 1
    from exam_session_staff s
    join exam_sessions e on e.id = s.session_id
    join roster r on r.class_id = e.container_class_id
    where s.teacher_id = auth.uid() and r.student_id = p_user_id
  )
  -- ou je suis candidat, l'autre est prof de la session
  or exists (
    select 1
    from roster r
    join exam_sessions e on e.container_class_id = r.class_id
    join exam_session_staff s on s.session_id = e.id
    where r.student_id = auth.uid() and s.teacher_id = p_user_id
  );
$fn$;

-- storage_file_usage — Source : 25_storage_file_usage.sql
create or replace function public.storage_file_usage(p_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_path text := coalesce(p_name, '');
  v_url  text := 'https://bwfynibzijxuiitmdrtw.supabase.co/storage/v1/object/public/assignment-files/' || coalesce(p_name, '');
  v_mine integer;
  v_others integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if v_path = ''
     or not coalesce((storage.foldername(v_path))[1] = any (array['images', 'audio', 'speaking']), false)
     or (storage.foldername(v_path))[2] is distinct from auth.uid()::text then
    raise exception 'Not allowed';
  end if;

  with used as (
    select a.id
    from assignments a
    where a.listening_audio_url in (v_path, v_url) or a.image_url in (v_path, v_url)
    union
    select s.assignment_id
    from exam_sections s
    where s.audio_url in (v_path, v_url)
       or s.image_url in (v_path, v_url)
       or strpos(coalesce(s.passage_text, ''), '[[image:' || v_url || ']]') > 0
       or strpos(coalesce(s.passage_text, ''), '[[image:' || v_path || ']]') > 0
    union
    select s.assignment_id
    from exam_sections s,
         jsonb_array_elements(case when jsonb_typeof(s.documents) = 'array' then s.documents else '[]'::jsonb end) d
    where d->>'path' = v_path or d->>'url' in (v_path, v_url)
    union
    select s.assignment_id
    from question_groups g
    join exam_sections s on s.id = g.section_id
    where g.image_url in (v_path, v_url)
       or strpos(coalesce(g.passage_text, ''), '[[image:' || v_url || ']]') > 0
       or strpos(coalesce(g.passage_text, ''), '[[image:' || v_path || ']]') > 0
  )
  select count(*) filter (where c.teacher_id = auth.uid()),
         count(*) filter (where c.teacher_id is distinct from auth.uid())
    into v_mine, v_others
  from used u
  join assignments a on a.id = u.id
  join classes c on c.id = a.class_id;

  return jsonb_build_object('mine', coalesce(v_mine, 0), 'others', coalesce(v_others, 0));
end;
$fn$;

-- submissions_guard — Source : 10_rls_copies_classes.sql
create or replace function public.submissions_guard()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  -- Appel hors navigateur (tâche serveur, éditeur SQL) : on laisse faire.
  if auth.uid() is null then return new; end if;
  -- Le professeur de la classe : rien à vérifier.
  if public.is_assignment_teacher(coalesce(new.assignment_id, old.assignment_id)) then return new; end if;

  if tg_op = 'INSERT' then
    new.grade := null; new.feedback := null; new.graded_at := null;
    new.score_task_achievement := null; new.score_coherence_cohesion := null;
    new.score_lexical_resource := null; new.score_grammar_accuracy := null;
  else
    if (new.grade is distinct from old.grade and new.grade is not null)
    or (new.feedback is distinct from old.feedback and new.feedback is not null)
    or (new.graded_at is distinct from old.graded_at and new.graded_at is not null)
    or (new.score_task_achievement is distinct from old.score_task_achievement and new.score_task_achievement is not null)
    or (new.score_coherence_cohesion is distinct from old.score_coherence_cohesion and new.score_coherence_cohesion is not null)
    or (new.score_lexical_resource  is distinct from old.score_lexical_resource  and new.score_lexical_resource  is not null)
    or (new.score_grammar_accuracy  is distinct from old.score_grammar_accuracy  and new.score_grammar_accuracy  is not null)
    then
      raise exception 'Only the teacher can set a mark';
    end if;
  end if;
  return new;
end $fn$;

-- submit_student_answer — Source : (aucun script : créée avant le 09)
create or replace function public.submit_student_answer(p_assignment_id uuid, p_question_id uuid, p_response jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_student_id uuid := auth.uid();
  v_class_id   uuid;
  v_limit      integer;
  v_started    timestamptz;
  v_submitted  timestamptz;
  v_grade      record;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select class_id, time_limit_minutes into v_class_id, v_limit
  from public.assignments where id = p_assignment_id;
  if v_class_id is null then
    raise exception 'Assignment not found';
  end if;

  if not exists (select 1 from public.roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  if not exists (
    select 1
    from public.assignment_questions aq
    join public.exam_sections s on s.id = aq.section_id
    where aq.question_id = p_question_id and s.assignment_id = p_assignment_id
  ) then
    raise exception 'Question not in this assignment';
  end if;

  select started_at, submitted_at into v_started, v_submitted
  from public.exam_attempts
  where assignment_id = p_assignment_id and student_id = v_student_id;

  if v_submitted is not null then
    raise exception 'Already submitted';
  end if;

  -- An answer already given can never be changed.
  if exists (select 1 from public.student_answers where student_id = v_student_id and question_id = p_question_id) then
    raise exception 'Already answered';
  end if;

  -- Submissions made with the old one-by-one method finish within
  -- seconds: anything added long after the first answer is refused.
  if exists (
    select 1 from public.student_answers
    where assignment_id = p_assignment_id and student_id = v_student_id
      and answered_at < now() - interval '2 minutes'
  ) then
    raise exception 'Already submitted';
  end if;

  if v_limit is not null then
    if v_started is null then
      raise exception 'Exam not started';
    end if;
    if now() > v_started + make_interval(mins => v_limit + 5) then
      raise exception 'Time is over';
    end if;
  end if;

  select * into v_grade from public.grade_student_answer(p_question_id, p_response);

  insert into public.student_answers (assignment_id, student_id, question_id, response, is_correct, points_earned)
  values (p_assignment_id, v_student_id, p_question_id, p_response, v_grade.is_correct, v_grade.points_earned);

  return jsonb_build_object('is_correct', v_grade.is_correct, 'points_earned', v_grade.points_earned, 'points_possible', v_grade.points_possible);
end;
$fn$;

-- submit_student_answers — Source : 15_exam_locks.sql
create or replace function public.submit_student_answers(p_assignment_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_student_id uuid := auth.uid();
  v_class_id   uuid;
  v_limit      integer;
  v_started    timestamptz;
  v_submitted  timestamptz;
  v_key        text;
  v_value      jsonb;
  v_qid        uuid;
  v_grade      record;
  v_count      integer := 0;
  v_exam       record;
  v_had_copy   boolean;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select class_id, time_limit_minutes into v_class_id, v_limit
  from assignments where id = p_assignment_id;
  if v_class_id is null then
    raise exception 'Assignment not found';
  end if;

  if not exists (select 1 from roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Invalid answers';
  end if;
  if (select count(*) from jsonb_object_keys(p_answers)) > 500 or length(p_answers::text) > 200000 then
    raise exception 'Too many answers';
  end if;

  -- Avait-il DEJA une copie en cours avant cet appel ? La question doit
  -- etre posee ici, avant la ligne qui en cree une au besoin — c'est
  -- elle qui distingue "j'etais en train de composer" de "je n'ai
  -- jamais rien commence". On ne compare aucune heure : dans une meme
  -- transaction now() ne bouge pas, une comparaison d'horloge serait
  -- donc fragile. L'existence de la copie, elle, ne ment pas.
  select true into v_had_copy from exam_attempts
   where assignment_id = p_assignment_id and student_id = v_student_id;
  v_had_copy := coalesce(v_had_copy, false);

  -- The attempt row is locked for the whole submission, so two
  -- submissions at the same time can't both go through.
  insert into exam_attempts (assignment_id, student_id, started_at)
  values (p_assignment_id, v_student_id, now())
  on conflict (assignment_id, student_id) do nothing;

  select started_at, submitted_at into v_started, v_submitted
  from exam_attempts
  where assignment_id = p_assignment_id and student_id = v_student_id
  for update;

  if v_submitted is not null
     or exists (select 1 from student_answers sa where sa.assignment_id = p_assignment_id and sa.student_id = v_student_id) then
    raise exception 'Already submitted';
  end if;

  -- ------------------------------------------------------------------
  -- NOUVEAU. Si cette epreuve appartient a une session d'examen :
  --   - resultats publies  → l'examen est termine, plus aucun rendu ;
  --   - session fermee     → on n'accepte QUE les copies qui existaient
  --     deja avant cet appel. Celui qui ecrivait au moment du clic du
  --     prof garde son travail ; celui qui n'avait rien commence ne
  --     peut plus composer.
  -- ------------------------------------------------------------------
  select e.closed_at, e.results_released_at into v_exam
  from exam_session_items i
  join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;

  if found then
    if v_exam.results_released_at is not null then
      raise exception 'This exam is over';
    end if;
    if v_exam.closed_at is not null and not v_had_copy then
      raise exception 'This exam is closed';
    end if;
  end if;

  if v_limit is not null and now() > v_started + make_interval(mins => v_limit + 5) then
    raise exception 'Time is over';
  end if;

  for v_key, v_value in select key, value from jsonb_each(p_answers) loop
    begin
      v_qid := v_key::uuid;
    exception when others then
      raise exception 'Invalid question';
    end;

    -- The question must really belong to THIS assignment.
    if not exists (
      select 1
      from assignment_questions aq
      join exam_sections s on s.id = aq.section_id
      where aq.question_id = v_qid and s.assignment_id = p_assignment_id
    ) then
      raise exception 'Question not in this assignment';
    end if;

    select * into v_grade from grade_student_answer(v_qid, v_value);

    insert into student_answers (assignment_id, student_id, question_id, response, is_correct, points_earned)
    values (p_assignment_id, v_student_id, v_qid, v_value, v_grade.is_correct, v_grade.points_earned);
    v_count := v_count + 1;
  end loop;

  update exam_attempts
     set submitted_at = now()
   where assignment_id = p_assignment_id and student_id = v_student_id;

  -- Only the number of answers is returned — never which ones are right.
  return jsonb_build_object('submitted', v_count);
end;
$fn$;

-- submit_writing — Source : 16_exam_manage.sql
create or replace function public.submit_writing(p_assignment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_student_id uuid := auth.uid();
  v_class_id   uuid;
  v_type       text;
  v_exam       record;
  v_had_copy   boolean;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select class_id, type into v_class_id, v_type from assignments where id = p_assignment_id;
  if v_class_id is null or v_type <> 'Writing' then
    raise exception 'Not a Writing assignment';
  end if;

  if not exists (select 1 from roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  -- Les memes verrous que pour les reponses : apres publication, plus
  -- rien ; apres fermeture, seulement une copie deja commencee.
  select true into v_had_copy from exam_attempts
   where assignment_id = p_assignment_id and student_id = v_student_id;
  v_had_copy := coalesce(v_had_copy, false);

  select e.closed_at, e.results_released_at into v_exam
  from exam_session_items i
  join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;

  if found then
    if v_exam.results_released_at is not null then
      raise exception 'This exam is over';
    end if;
    if v_exam.closed_at is not null and not v_had_copy then
      raise exception 'This exam is closed';
    end if;
    -- Une copie rendue est ramassee : on ne la rend pas deux fois.
    -- (Le texte etait deja gele — save_writing_draft refuse d'ecrire
    -- apres le rendu — mais la fonction repondait quand meme "rendu".
    -- Dans une classe ordinaire, on ne change rien : le double envoi y
    -- reste sans effet et sans erreur, comme avant.)
    if exists (select 1 from exam_attempts a
               where a.assignment_id = p_assignment_id
                 and a.student_id = v_student_id
                 and a.submitted_at is not null) then
      raise exception 'Already submitted';
    end if;
  end if;

  -- A task the student never typed in still gets an (empty) row, so the
  -- teacher sees it as submitted-but-blank rather than missing.
  insert into writing_responses (assignment_id, section_id, student_id)
  select p_assignment_id, s.id, v_student_id
  from exam_sections s
  where s.assignment_id = p_assignment_id and s.task_number is not null
  on conflict (section_id, student_id) do nothing;

  update writing_responses
     set submitted_at = now()
   where assignment_id = p_assignment_id
     and student_id = v_student_id
     and submitted_at is null;

  -- NOUVEAU : le registre unique du rendu.
  insert into exam_attempts (assignment_id, student_id, started_at)
  values (p_assignment_id, v_student_id, now())
  on conflict (assignment_id, student_id) do nothing;

  update exam_attempts
     set submitted_at = coalesce(submitted_at, now())
   where assignment_id = p_assignment_id and student_id = v_student_id;

  return jsonb_build_object('submitted', true);
end $fn$;

-- =====================================================================
-- 6. DECLENCHEURS
-- =====================================================================

CREATE TRIGGER guard_exam_paper_release BEFORE INSERT OR UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION exam_paper_release_guard();
CREATE TRIGGER guard_live_exam_sections BEFORE DELETE ON public.exam_sections FOR EACH ROW EXECUTE FUNCTION exam_live_content_guard();
CREATE TRIGGER guard_live_exam_questions BEFORE DELETE ON public.questions FOR EACH ROW EXECUTE FUNCTION exam_live_content_guard();
CREATE TRIGGER trg_submissions_guard BEFORE INSERT OR UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION submissions_guard();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================================
-- 7. REGLES RLS (60 sur public, 5 sur le stockage)
-- =====================================================================

create policy "exam staff mark feedback" on public.assignment_feedback
  as permissive
  for all
  to public
  using (is_exam_staff_of_assignment(assignment_id))
  with check (is_exam_staff_of_assignment(assignment_id));

create policy "students read own released feedback" on public.assignment_feedback
  as permissive
  for select
  to public
  using (((student_id = auth.uid()) AND (released_at IS NOT NULL)));

create policy "teachers manage feedback in own class" on public.assignment_feedback
  as permissive
  for all
  to public
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = assignment_feedback.assignment_id) AND (c.teacher_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = assignment_feedback.assignment_id) AND (c.teacher_id = auth.uid())))));

create policy "links readable by class members" on public.assignment_questions
  as permissive
  for select
  to public
  using ((section_id IN ( SELECT readable_section_ids() AS readable_section_ids)));

create policy "teacher manages own assignment_questions" on public.assignment_questions
  as permissive
  for all
  to public
  using ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = assignment_questions.question_id) AND (q.teacher_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = assignment_questions.question_id) AND (q.teacher_id = auth.uid())))));

create policy "assignments readable by class members" on public.assignments
  as permissive
  for select
  to public
  using (can_read_assignment(id));

create policy "teacher can create assignments in own class" on public.assignments
  as permissive
  for insert
  to public
  with check ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = assignments.class_id) AND (c.teacher_id = auth.uid())))));

create policy "teacher can delete own assignments" on public.assignments
  as permissive
  for delete
  to public
  using ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = assignments.class_id) AND (c.teacher_id = auth.uid())))));

create policy "teacher reads own assignment rows" on public.assignments
  as permissive
  for select
  to public
  using (is_class_teacher(class_id));

create policy "teacher updates own assignments" on public.assignments
  as permissive
  for update
  to public
  using (is_class_teacher(class_id))
  with check (is_class_teacher(class_id));

create policy "classes readable by exam staff" on public.classes
  as permissive
  for select
  to public
  using (is_exam_container_staff(id));

create policy "classes readable by owner or member" on public.classes
  as permissive
  for select
  to public
  using (((teacher_id = auth.uid()) OR is_enrolled(id)));

create policy "teacher deletes own class" on public.classes
  as permissive
  for delete
  to public
  using ((teacher_id = auth.uid()));

create policy "teachers can create classes" on public.classes
  as permissive
  for insert
  to public
  with check ((auth.uid() = teacher_id));

create policy "exam staff read attempts" on public.exam_attempts
  as permissive
  for select
  to public
  using (is_exam_staff_of_assignment(assignment_id));

create policy "students read own attempts" on public.exam_attempts
  as permissive
  for select
  to public
  using ((student_id = auth.uid()));

create policy "teachers read attempts in own classes" on public.exam_attempts
  as permissive
  for select
  to public
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = exam_attempts.assignment_id) AND (c.teacher_id = auth.uid())))));

create policy "incidents readable by owner or exam staff" on public.exam_incidents
  as permissive
  for select
  to public
  using (((student_id = auth.uid()) OR is_exam_staff(session_id)));

create policy "sections readable by class members" on public.exam_sections
  as permissive
  for select
  to public
  using (can_read_assignment(assignment_id));

create policy "teacher manages sections of own assignments" on public.exam_sections
  as permissive
  for all
  to public
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = exam_sections.assignment_id) AND (c.teacher_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = exam_sections.assignment_id) AND (c.teacher_id = auth.uid())))));

create policy "exam items managed by staff" on public.exam_session_items
  as permissive
  for all
  to public
  using (is_exam_staff(session_id))
  with check (is_exam_staff(session_id));

create policy "exam items readable by staff or candidate" on public.exam_session_items
  as permissive
  for select
  to public
  using ((is_exam_staff(session_id) OR is_exam_candidate(session_id)));

create policy "exam staff managed by creator" on public.exam_session_staff
  as permissive
  for all
  to public
  using ((EXISTS ( SELECT 1
   FROM exam_sessions e
  WHERE ((e.id = exam_session_staff.session_id) AND (e.created_by = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM exam_sessions e
  WHERE ((e.id = exam_session_staff.session_id) AND (e.created_by = auth.uid())))));

create policy "exam staff readable by staff" on public.exam_session_staff
  as permissive
  for select
  to public
  using (is_exam_staff(session_id));

create policy "exam sessions deleted by creator" on public.exam_sessions
  as permissive
  for delete
  to public
  using ((created_by = auth.uid()));

create policy "exam sessions readable by staff or candidate" on public.exam_sessions
  as permissive
  for select
  to public
  using ((is_exam_staff(id) OR is_exam_candidate(id)));

create policy "exam sessions written by staff" on public.exam_sessions
  as permissive
  for update
  to public
  using (is_exam_staff(id))
  with check (is_exam_staff(id));

create policy "students read their own play counts" on public.listening_plays
  as permissive
  for select
  to public
  using ((auth.uid() = student_id));

create policy "teachers read play counts in own classes" on public.listening_plays
  as permissive
  for select
  to public
  using (is_assignment_teacher(assignment_id));

create policy "profiles readable by exam staff" on public.profiles
  as permissive
  for select
  to public
  using (shares_exam_with(id));

create policy "profiles readable by self or class members" on public.profiles
  as permissive
  for select
  to public
  using (((id = auth.uid()) OR shares_class_with(id)));

create policy "users can insert own profile" on public.profiles
  as permissive
  for insert
  to public
  with check ((auth.uid() = id));

create policy "users can update own profile" on public.profiles
  as permissive
  for update
  to public
  using ((auth.uid() = id));

create policy "exam staff read answer keys" on public.question_answer_key
  as permissive
  for select
  to public
  using (is_exam_staff_of_question(question_id));

create policy "students see answer key once released and allowed" on public.question_answer_key
  as permissive
  for select
  to public
  using ((EXISTS ( SELECT 1
   FROM (((student_answers sa
     JOIN assignment_questions aq ON ((aq.question_id = sa.question_id)))
     JOIN exam_sections es ON ((es.id = aq.section_id)))
     JOIN assignments a ON ((a.id = es.assignment_id)))
  WHERE ((sa.question_id = question_answer_key.question_id) AND (sa.student_id = auth.uid()) AND (a.show_answer_review = true) AND ((a.auto_release_score = true) OR (EXISTS ( SELECT 1
           FROM assignment_feedback af
          WHERE ((af.assignment_id = a.id) AND (af.student_id = auth.uid()) AND (af.released_at IS NOT NULL)))))))));

create policy "teacher manages own answer keys" on public.question_answer_key
  as permissive
  for all
  to public
  using ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = question_answer_key.question_id) AND (q.teacher_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = question_answer_key.question_id) AND (q.teacher_id = auth.uid())))));

create policy "groups readable by class members" on public.question_groups
  as permissive
  for select
  to public
  using ((section_id IN ( SELECT readable_section_ids() AS readable_section_ids)));

create policy "teacher manages own question_groups" on public.question_groups
  as permissive
  for all
  to public
  using ((EXISTS ( SELECT 1
   FROM ((exam_sections s
     JOIN assignments a ON ((a.id = s.assignment_id)))
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((s.id = question_groups.section_id) AND (c.teacher_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM ((exam_sections s
     JOIN assignments a ON ((a.id = s.assignment_id)))
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((s.id = question_groups.section_id) AND (c.teacher_id = auth.uid())))));

create policy "questions readable by class members" on public.questions
  as permissive
  for select
  to public
  using ((id IN ( SELECT readable_question_ids() AS readable_question_ids)));

create policy "teacher manages own questions" on public.questions
  as permissive
  for all
  to public
  using ((teacher_id = auth.uid()))
  with check ((teacher_id = auth.uid()));

create policy "students manage their own highlights" on public.reading_highlights
  as permissive
  for all
  to public
  using ((auth.uid() = student_id))
  with check ((auth.uid() = student_id));

create policy "roster readable by owner or teacher" on public.roster
  as permissive
  for select
  to public
  using (((student_id = auth.uid()) OR is_class_teacher(class_id)));

create policy "student leaves or teacher removes" on public.roster
  as permissive
  for delete
  to public
  using (((student_id = auth.uid()) OR is_class_teacher(class_id)));

create policy "exam staff read speaking views" on public.speaking_views
  as permissive
  for select
  to public
  using (is_exam_staff_of_assignment(assignment_id));

create policy "students read own speaking views" on public.speaking_views
  as permissive
  for select
  to public
  using ((student_id = auth.uid()));

create policy "students record own speaking view" on public.speaking_views
  as permissive
  for insert
  to public
  with check (((student_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (assignments a
     JOIN roster r ON ((r.class_id = a.class_id)))
  WHERE ((a.id = speaking_views.assignment_id) AND (a.type = 'Speaking'::text) AND (r.student_id = auth.uid()))))));

create policy "teachers read speaking views in own classes" on public.speaking_views
  as permissive
  for select
  to public
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = speaking_views.assignment_id) AND (c.teacher_id = auth.uid())))));

create policy "exam staff read answers" on public.student_answers
  as permissive
  for select
  to public
  using (is_exam_staff_of_question(question_id));

create policy "students see own answers once released" on public.student_answers
  as permissive
  for select
  to public
  using (((student_id = auth.uid()) AND answers_released(assignment_id)));

create policy "teacher sees answers to own questions" on public.student_answers
  as permissive
  for select
  to public
  using ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = student_answers.question_id) AND (q.teacher_id = auth.uid())))));

create policy "students can submit own work" on public.submissions
  as permissive
  for insert
  to public
  with check ((auth.uid() = student_id));

create policy "students can update own submission" on public.submissions
  as permissive
  for update
  to public
  using ((auth.uid() = student_id));

create policy "submissions readable by owner or teacher" on public.submissions
  as permissive
  for select
  to public
  using (((student_id = auth.uid()) OR is_assignment_teacher(assignment_id)));

create policy "teachers can grade submissions in own class" on public.submissions
  as permissive
  for update
  to public
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = submissions.assignment_id) AND (c.teacher_id = auth.uid())))));

create policy "exam staff mark writing" on public.writing_grades
  as permissive
  for all
  to public
  using (is_exam_staff_of_assignment(assignment_id))
  with check (is_exam_staff_of_assignment(assignment_id));

create policy "students read own released writing grades" on public.writing_grades
  as permissive
  for select
  to public
  using (((student_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM assignment_feedback f
  WHERE ((f.assignment_id = writing_grades.assignment_id) AND (f.student_id = auth.uid()) AND (f.released_at IS NOT NULL))))));

create policy "teachers manage writing grades in own classes" on public.writing_grades
  as permissive
  for all
  to public
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = writing_grades.assignment_id) AND (c.teacher_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (((assignments a
     JOIN classes c ON ((c.id = a.class_id)))
     JOIN exam_sections s ON ((s.assignment_id = a.id)))
     JOIN roster r ON ((r.class_id = c.id)))
  WHERE ((a.id = writing_grades.assignment_id) AND (s.id = writing_grades.section_id) AND (r.student_id = writing_grades.student_id) AND (c.teacher_id = auth.uid())))));

create policy "exam staff read writing" on public.writing_responses
  as permissive
  for select
  to public
  using (is_exam_staff_of_assignment(assignment_id));

create policy "students read own writing" on public.writing_responses
  as permissive
  for select
  to public
  using ((student_id = auth.uid()));

create policy "teachers read writing in own classes" on public.writing_responses
  as permissive
  for select
  to public
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = writing_responses.assignment_id) AND (c.teacher_id = auth.uid())))));

create policy "readers read the files of what they can read" on storage.objects
  as permissive
  for select
  to authenticated
  using (((bucket_id = 'assignment-files'::text) AND can_read_storage_file(name)));

create policy "teachers can delete their own audio files" on storage.objects
  as permissive
  for delete
  to authenticated
  using (((bucket_id = 'assignment-files'::text) AND ((storage.foldername(name))[1] = 'audio'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));

create policy "teachers can delete their own speaking documents" on storage.objects
  as permissive
  for delete
  to public
  using (((bucket_id = 'assignment-files'::text) AND ((storage.foldername(name))[1] = 'speaking'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));

create policy "teachers list their own files" on storage.objects
  as permissive
  for select
  to authenticated
  using (((bucket_id = 'assignment-files'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['images'::text, 'audio'::text, 'speaking'::text])) AND ((storage.foldername(name))[2] = (auth.uid())::text)));

create policy "uploads limited to own folders" on storage.objects
  as permissive
  for insert
  to authenticated
  with check (((bucket_id = 'assignment-files'::text) AND ((((storage.foldername(name))[1] = ANY (ARRAY['images'::text, 'audio'::text, 'speaking'::text])) AND ((storage.foldername(name))[2] = (auth.uid())::text)) OR can_write_class_file((storage.foldername(name))[1]))));

-- =====================================================================
-- 8. DROITS
--    Tables : droits par defaut de Supabase (la RLS protege les lignes).
--    exam_attempt_pages : aucun droit (seules les fonctions y touchent).
-- =====================================================================

grant update (name) on public.profiles to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.assignment_feedback to anon;
grant delete, insert, references, select, trigger, truncate, update on public.assignment_feedback to authenticated;
grant delete, insert, references, trigger, truncate, update on public.assignment_questions to anon;
grant delete, insert, references, select, trigger, truncate, update on public.assignment_questions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.assignments to anon;
grant delete, insert, references, select, trigger, truncate, update on public.assignments to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.classes to anon;
grant delete, insert, references, select, trigger, truncate, update on public.classes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.exam_attempts to anon;
grant delete, insert, references, select, trigger, truncate, update on public.exam_attempts to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.exam_incidents to anon;
grant delete, insert, references, select, trigger, truncate, update on public.exam_incidents to authenticated;
grant delete, insert, references, trigger, truncate, update on public.exam_sections to anon;
grant delete, insert, references, select, trigger, truncate, update on public.exam_sections to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.exam_session_items to anon;
grant delete, insert, references, select, trigger, truncate, update on public.exam_session_items to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.exam_session_staff to anon;
grant delete, insert, references, select, trigger, truncate, update on public.exam_session_staff to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.exam_sessions to anon;
grant delete, insert, references, select, trigger, truncate, update on public.exam_sessions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.listening_plays to anon;
grant delete, insert, references, select, trigger, truncate, update on public.listening_plays to authenticated;
grant delete, insert, references, select, trigger, truncate on public.profiles to anon;
grant delete, insert, references, select, trigger, truncate on public.profiles to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.question_answer_key to anon;
grant delete, insert, references, select, trigger, truncate, update on public.question_answer_key to authenticated;
grant delete, insert, references, trigger, truncate, update on public.question_groups to anon;
grant delete, insert, references, select, trigger, truncate, update on public.question_groups to authenticated;
grant delete, insert, references, trigger, truncate, update on public.questions to anon;
grant delete, insert, references, select, trigger, truncate, update on public.questions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.reading_highlights to anon;
grant delete, insert, references, select, trigger, truncate, update on public.reading_highlights to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.roster to anon;
grant delete, insert, references, select, trigger, truncate, update on public.roster to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.speaking_views to anon;
grant delete, insert, references, select, trigger, truncate, update on public.speaking_views to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.student_answers to anon;
grant delete, insert, references, select, trigger, truncate, update on public.student_answers to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.submissions to anon;
grant delete, insert, references, select, trigger, truncate, update on public.submissions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.writing_grades to anon;
grant delete, insert, references, select, trigger, truncate, update on public.writing_grades to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.writing_responses to anon;
grant delete, insert, references, select, trigger, truncate, update on public.writing_responses to authenticated;
revoke all on public.exam_attempt_pages from public, anon, authenticated;

revoke all on function public.answers_released(p_assignment_id uuid) from public, anon, authenticated;
grant execute on function public.answers_released(p_assignment_id uuid) to authenticated;
revoke all on function public.can_read_assignment(p_assignment_id uuid) from public, anon, authenticated;
grant execute on function public.can_read_assignment(p_assignment_id uuid) to authenticated;
revoke all on function public.can_read_question(p_question_id uuid) from public, anon, authenticated;
grant execute on function public.can_read_question(p_question_id uuid) to authenticated;
revoke all on function public.can_read_section(p_section_id uuid) from public, anon, authenticated;
grant execute on function public.can_read_section(p_section_id uuid) to authenticated;
revoke all on function public.can_read_storage_file(p_name text) from public, anon, authenticated;
grant execute on function public.can_read_storage_file(p_name text) to authenticated;
revoke all on function public.can_write_class_file(p_folder text) from public, anon, authenticated;
grant execute on function public.can_write_class_file(p_folder text) to authenticated;
revoke all on function public.create_exam_session(p_name text) from public, anon, authenticated;
grant execute on function public.create_exam_session(p_name text) to authenticated;
revoke all on function public.delete_exam_session(p_session_id uuid) from public, anon, authenticated;
grant execute on function public.delete_exam_session(p_session_id uuid) to authenticated;
revoke all on function public.duplicate_assignment(p_assignment_id uuid, p_target_class_id uuid) from public, anon, authenticated;
grant execute on function public.duplicate_assignment(p_assignment_id uuid, p_target_class_id uuid) to authenticated;
revoke all on function public.duplicate_exam_session(p_session_id uuid, p_name text) from public, anon, authenticated;
grant execute on function public.duplicate_exam_session(p_session_id uuid, p_name text) to authenticated;
revoke all on function public.duplicate_targets() from public, anon, authenticated;
grant execute on function public.duplicate_targets() to authenticated;
revoke all on function public.exam_allow_resume(p_session_id uuid, p_student_id uuid) from public, anon, authenticated;
grant execute on function public.exam_allow_resume(p_session_id uuid, p_student_id uuid) to authenticated;
revoke all on function public.exam_explain_incident(p_assignment_id uuid, p_reason text) from public, anon, authenticated;
grant execute on function public.exam_explain_incident(p_assignment_id uuid, p_reason text) to authenticated;
revoke all on function public.exam_invigilation_board(p_session_id uuid) from public, anon, authenticated;
grant execute on function public.exam_invigilation_board(p_session_id uuid) to authenticated;
revoke all on function public.exam_is_open(p_session_id uuid) from public, anon, authenticated;
grant execute on function public.exam_is_open(p_session_id uuid) to authenticated;
revoke all on function public.exam_item_readable(p_assignment_id uuid) from public, anon, authenticated;
grant execute on function public.exam_item_readable(p_assignment_id uuid) to authenticated;
revoke all on function public.exam_item_startable(p_assignment_id uuid) from public, anon, authenticated;
grant execute on function public.exam_item_startable(p_assignment_id uuid) to authenticated;
revoke all on function public.exam_live_content_guard() from public, anon, authenticated;
grant execute on function public.exam_live_content_guard() to public;
revoke all on function public.exam_my_invigilation(p_assignment_id uuid) from public, anon, authenticated;
grant execute on function public.exam_my_invigilation(p_assignment_id uuid) to authenticated;
revoke all on function public.exam_paper_release_guard() from public, anon, authenticated;
grant execute on function public.exam_paper_release_guard() to public;
revoke all on function public.exam_report_incident(p_assignment_id uuid, p_kind text) from public, anon, authenticated;
grant execute on function public.exam_report_incident(p_assignment_id uuid, p_kind text) to authenticated;
revoke all on function public.exam_reset_audio(p_assignment_id uuid, p_student_id uuid) from public, anon, authenticated;
grant execute on function public.exam_reset_audio(p_assignment_id uuid, p_student_id uuid) to authenticated;
revoke all on function public.exam_session_action(p_session_id uuid, p_action text, p_item_id uuid) from public, anon, authenticated;
grant execute on function public.exam_session_action(p_session_id uuid, p_action text, p_item_id uuid) to authenticated;
revoke all on function public.exam_session_status(p_session_id uuid) from public, anon, authenticated;
grant execute on function public.exam_session_status(p_session_id uuid) to authenticated;
revoke all on function public.exam_start_item(p_assignment_id uuid) from public, anon, authenticated;
grant execute on function public.exam_start_item(p_assignment_id uuid) to authenticated;
revoke all on function public.exam_timer_status(p_assignment_id uuid, p_start boolean, p_page uuid) from public, anon, authenticated;
grant execute on function public.exam_timer_status(p_assignment_id uuid, p_start boolean, p_page uuid) to authenticated;
revoke all on function public.get_paper(p_assignment_id uuid, p_with_keys boolean) from public, anon, authenticated;
grant execute on function public.get_paper(p_assignment_id uuid, p_with_keys boolean) to authenticated;
revoke all on function public.grade_student_answer(p_question_id uuid, p_response jsonb) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_assignment_teacher(p_assignment_id uuid) from public, anon, authenticated;
grant execute on function public.is_assignment_teacher(p_assignment_id uuid) to authenticated;
revoke all on function public.is_class_teacher(p_class_id uuid) from public, anon, authenticated;
grant execute on function public.is_class_teacher(p_class_id uuid) to authenticated;
revoke all on function public.is_enrolled(p_class_id uuid) from public, anon, authenticated;
grant execute on function public.is_enrolled(p_class_id uuid) to authenticated;
revoke all on function public.is_exam_candidate(p_session_id uuid) from public, anon, authenticated;
grant execute on function public.is_exam_candidate(p_session_id uuid) to authenticated;
revoke all on function public.is_exam_container_staff(p_class_id uuid) from public, anon, authenticated;
grant execute on function public.is_exam_container_staff(p_class_id uuid) to authenticated;
revoke all on function public.is_exam_staff(p_session_id uuid) from public, anon, authenticated;
grant execute on function public.is_exam_staff(p_session_id uuid) to authenticated;
revoke all on function public.is_exam_staff_of_assignment(p_assignment_id uuid) from public, anon, authenticated;
grant execute on function public.is_exam_staff_of_assignment(p_assignment_id uuid) to authenticated;
revoke all on function public.is_exam_staff_of_question(p_question_id uuid) from public, anon, authenticated;
grant execute on function public.is_exam_staff_of_question(p_question_id uuid) to authenticated;
revoke all on function public.join_class(p_code text) from public, anon, authenticated;
grant execute on function public.join_class(p_code text) to authenticated;
revoke all on function public.join_exam(p_code text) from public, anon, authenticated;
grant execute on function public.join_exam(p_code text) to authenticated;
revoke all on function public.list_invitable_teachers(p_session_id uuid) from public, anon, authenticated;
grant execute on function public.list_invitable_teachers(p_session_id uuid) to authenticated;
revoke all on function public.listening_audio_status(p_assignment_id uuid, p_start boolean) from public, anon, authenticated;
grant execute on function public.listening_audio_status(p_assignment_id uuid, p_start boolean) to authenticated;
revoke all on function public.normalize_answer_text(p_text text) from public, anon, authenticated;
grant execute on function public.normalize_answer_text(p_text text) to authenticated;
revoke all on function public.paper_blank_count(p_text text) from public, anon, authenticated;
grant execute on function public.paper_blank_count(p_text text) to authenticated;
revoke all on function public.paper_edit_state(p_assignment_id uuid) from public, anon, authenticated;
grant execute on function public.paper_edit_state(p_assignment_id uuid) to authenticated;
revoke all on function public.paper_json_shape(p jsonb, p_key text) from public, anon, authenticated;
grant execute on function public.paper_json_shape(p jsonb, p_key text) to authenticated;
revoke all on function public.paper_own_file(p_value text, p_folder text) from public, anon, authenticated;
grant execute on function public.paper_own_file(p_value text, p_folder text) to authenticated;
revoke all on function public.readable_paper_ids() from public, anon, authenticated;
grant execute on function public.readable_paper_ids() to authenticated;
revoke all on function public.readable_question_ids() from public, anon, authenticated;
grant execute on function public.readable_question_ids() to authenticated;
revoke all on function public.readable_section_ids() from public, anon, authenticated;
grant execute on function public.readable_section_ids() to authenticated;
revoke all on function public.record_audio_play(p_assignment_id uuid, p_section_id uuid, p_max_plays integer) from public, anon, authenticated;
grant execute on function public.record_audio_play(p_assignment_id uuid, p_section_id uuid, p_max_plays integer) to authenticated;
revoke all on function public.rename_exam_session(p_session_id uuid, p_name text) from public, anon, authenticated;
grant execute on function public.rename_exam_session(p_session_id uuid, p_name text) to authenticated;
revoke all on function public.save_paper_edits(p_assignment_id uuid, p_edits jsonb) from public, anon, authenticated;
grant execute on function public.save_paper_edits(p_assignment_id uuid, p_edits jsonb) to authenticated;
revoke all on function public.save_writing_draft(p_section_id uuid, p_content_html text, p_word_count integer) from public, anon, authenticated;
grant execute on function public.save_writing_draft(p_section_id uuid, p_content_html text, p_word_count integer) to authenticated;
revoke all on function public.shares_class_with(p_user_id uuid) from public, anon, authenticated;
grant execute on function public.shares_class_with(p_user_id uuid) to authenticated;
revoke all on function public.shares_exam_with(p_user_id uuid) from public, anon, authenticated;
grant execute on function public.shares_exam_with(p_user_id uuid) to authenticated;
revoke all on function public.storage_file_usage(p_name text) from public, anon, authenticated;
grant execute on function public.storage_file_usage(p_name text) to authenticated;
revoke all on function public.submissions_guard() from public, anon, authenticated;
grant execute on function public.submissions_guard() to public;
revoke all on function public.submit_student_answer(p_assignment_id uuid, p_question_id uuid, p_response jsonb) from public, anon, authenticated;
revoke all on function public.submit_student_answers(p_assignment_id uuid, p_answers jsonb) from public, anon, authenticated;
grant execute on function public.submit_student_answers(p_assignment_id uuid, p_answers jsonb) to authenticated;
revoke all on function public.submit_writing(p_assignment_id uuid) from public, anon, authenticated;
grant execute on function public.submit_writing(p_assignment_id uuid) to authenticated;

-- =====================================================================
-- 9. STOCKAGE
-- =====================================================================

insert into storage.buckets (id, name, public) values ('assignment-files', 'assignment-files', false);  -- espace PRIVE ; regles : section 7
