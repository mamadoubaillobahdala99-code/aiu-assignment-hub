-- =====================================================================
--  AIU Assignment Hub — étape 1 des failles de sécurité
--  Ferme F1 (contenu des examens lisible par tout compte connecté),
--  F2 (is_correct visible avant publication) et F15 (la fonction
--  submit_student_answer renvoie la correction à l'appelant).
--
--  Ce script est RELANÇABLE : on peut l'exécuter plusieurs fois sans
--  rien casser. Il ne supprime aucune donnée.
--  À coller dans Supabase → SQL Editor → Run.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Fonctions d'aide
--
--    SECURITY DEFINER : elles répondent toujours au sujet de la
--    personne connectée (auth.uid()) et de personne d'autre, donc elles
--    ne peuvent rien divulguer. Elles contournent volontairement le RLS
--    des tables classes / roster qu'elles consultent : sans cela, une
--    règle posée plus tard sur ces tables casserait toutes celles-ci.
--    'stable' permet à Postgres de réutiliser le résultat dans une même
--    requête : c'est ce qui rend les règles rapides.
-- ---------------------------------------------------------------------

create or replace function public.can_read_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from assignments a
    where a.id = p_assignment_id
      and ( exists (select 1 from classes c where c.id = a.class_id and c.teacher_id = auth.uid())
         or exists (select 1 from roster  r where r.class_id = a.class_id and r.student_id = auth.uid()) )
  );
$$;

create or replace function public.can_read_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from exam_sections s
    join assignments a on a.id = s.assignment_id
    where s.id = p_section_id
      and ( exists (select 1 from classes c where c.id = a.class_id and c.teacher_id = auth.uid())
         or exists (select 1 from roster  r where r.class_id = a.class_id and r.student_id = auth.uid()) )
  );
$$;

create or replace function public.can_read_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from assignment_questions aq
    join exam_sections s on s.id = aq.section_id
    join assignments   a on a.id = s.assignment_id
    where aq.question_id = p_question_id
      and ( exists (select 1 from classes c where c.id = a.class_id and c.teacher_id = auth.uid())
         or exists (select 1 from roster  r where r.class_id = a.class_id and r.student_id = auth.uid()) )
  );
$$;

-- Les résultats de CE devoir sont-ils publiés pour la personne connectée ?
create or replace function public.answers_released(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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
$$;

-- Personne d'autre que les comptes connectés ne peut les appeler.
revoke all on function public.can_read_assignment(uuid) from public, anon;
revoke all on function public.can_read_section(uuid)    from public, anon;
revoke all on function public.can_read_question(uuid)   from public, anon;
revoke all on function public.answers_released(uuid)    from public, anon;
grant execute on function public.can_read_assignment(uuid) to authenticated;
grant execute on function public.can_read_section(uuid)    to authenticated;
grant execute on function public.can_read_question(uuid)   to authenticated;
grant execute on function public.answers_released(uuid)    to authenticated;

-- ---------------------------------------------------------------------
-- 2. Index
--    Aucune de ces colonnes de liaison n'était indexée. Sans eux, les
--    nouvelles règles seraient lentes — et l'application l'était déjà
--    un peu sans qu'on le voie.
-- ---------------------------------------------------------------------

create index if not exists idx_assignments_class               on public.assignments(class_id);
create index if not exists idx_exam_sections_assignment        on public.exam_sections(assignment_id);
create index if not exists idx_question_groups_section         on public.question_groups(section_id);
create index if not exists idx_aq_question                     on public.assignment_questions(question_id);
create index if not exists idx_aq_section                      on public.assignment_questions(section_id);
create index if not exists idx_aq_group                        on public.assignment_questions(group_id);
create index if not exists idx_student_answers_assignment_stud on public.student_answers(assignment_id, student_id);

-- ---------------------------------------------------------------------
-- 3. F1 — le contenu d'un examen n'est lisible que par le prof
--    propriétaire de la classe et par les étudiants inscrits.
--
--    Les règles d'écriture des profs (« teacher manages own … ») ne sont
--    pas touchées : elles couvrent déjà la lecture pour le prof.
-- ---------------------------------------------------------------------

drop policy if exists "assignments viewable by authenticated"  on public.assignments;
drop policy if exists "assignments readable by class members"   on public.assignments;
create policy "assignments readable by class members"
  on public.assignments for select
  using (public.can_read_assignment(id));

drop policy if exists "sections viewable by authenticated"      on public.exam_sections;
drop policy if exists "sections readable by class members"      on public.exam_sections;
create policy "sections readable by class members"
  on public.exam_sections for select
  using (public.can_read_assignment(assignment_id));

drop policy if exists "question_groups viewable by authenticated" on public.question_groups;
drop policy if exists "groups readable by class members"          on public.question_groups;
create policy "groups readable by class members"
  on public.question_groups for select
  using (public.can_read_section(section_id));

drop policy if exists "assignment_questions viewable by authenticated" on public.assignment_questions;
drop policy if exists "links readable by class members"                on public.assignment_questions;
create policy "links readable by class members"
  on public.assignment_questions for select
  using (public.can_read_section(section_id));

drop policy if exists "questions viewable by authenticated"  on public.questions;
drop policy if exists "questions readable by class members"  on public.questions;
create policy "questions readable by class members"
  on public.questions for select
  using (public.can_read_question(id));

-- ---------------------------------------------------------------------
-- 4. F2 — un étudiant ne voit ses réponses corrigées qu'une fois les
--    résultats publiés (auto_release_score, ou publication par le prof).
--
--    Une règle RLS travaille par ligne, pas par colonne : on ne peut pas
--    montrer `response` en cachant `is_correct`. La ligne entière est
--    donc réservée à l'après-publication. L'application n'en a pas
--    besoin avant : l'état « rendu » vient de exam_attempts.submitted_at.
--
--    La règle du prof (« teacher sees answers to own questions ») ne
--    change pas : il voit tout, tout le temps.
-- ---------------------------------------------------------------------

drop policy if exists "students see own answers"              on public.student_answers;
drop policy if exists "students see own answers once released" on public.student_answers;
create policy "students see own answers once released"
  on public.student_answers for select
  using (student_id = auth.uid() and public.answers_released(assignment_id));

-- ---------------------------------------------------------------------
-- 5. F15 — submit_student_answer (au singulier) renvoie `is_correct` à
--    celui qui l'appelle. Elle n'est plus utilisée par le site (seul
--    l'écran de laboratoire, non relié à l'application, s'en servait) :
--    un étudiant pouvait donc répondre question par question par l'API
--    et connaître la correction en direct.
--    On la ferme sans la supprimer — rien n'est détruit.
-- ---------------------------------------------------------------------

revoke execute on function public.submit_student_answer(uuid, uuid, jsonb) from public, anon, authenticated;

commit;

-- =====================================================================
--  VÉRIFICATIONS — à lire après l'exécution
-- =====================================================================

-- V1. Les cinq règles trop larges ont disparu ; les nouvelles sont là.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('assignments','exam_sections','question_groups','assignment_questions','questions','student_answers')
  and cmd = 'SELECT'
order by tablename, policyname;
-- Attendu : plus aucune ligne « … viewable by authenticated »,
--           et « students see own answers once released » sur student_answers.

-- V2. Les quatre fonctions d'aide n'appartiennent qu'aux comptes connectés.
select p.proname, array_to_string(p.proacl, ' | ') as droits
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('can_read_assignment','can_read_section','can_read_question','answers_released','submit_student_answer')
order by p.proname;
-- Attendu : authenticated=X sur les quatre premières ;
--           AUCUN authenticated ni anon sur submit_student_answer.

-- V3. Les index sont en place.
select indexname from pg_indexes
where schemaname = 'public'
  and indexname in ('idx_assignments_class','idx_exam_sections_assignment','idx_question_groups_section',
                    'idx_aq_question','idx_aq_section','idx_aq_group','idx_student_answers_assignment_stud')
order by indexname;
-- Attendu : les 7 lignes.

-- V4. Le test qui compte : un compte connecté qui n'est inscrit nulle
--     part ne doit plus rien voir. (Transaction annulée : ne modifie rien.)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select 'un inconnu connecte voit :' as test,
       (select count(*) from assignments)          as devoirs,
       (select count(*) from exam_sections)        as parts,
       (select count(*) from question_groups)      as groupes,
       (select count(*) from assignment_questions) as liens,
       (select count(*) from questions)            as questions,
       (select count(*) from student_answers)      as reponses;
rollback;
-- Attendu : que des zéros.
