-- ============================================================================
-- 20_exam_staff_content.sql
--
-- Le prof invite sur une session d'examen voyait un ecran vide : il lisait
-- bien les reponses des candidats, leurs copies et les corriges, mais PAS les
-- questions. Une reponse sans sa question n'affiche rien.
--
-- Cause : deux fonctions de permission, can_read_section et can_read_question,
-- ne connaissaient que le prof proprietaire de la classe et les etudiants
-- inscrits. Leurs deux soeurs, can_read_assignment et is_class_teacher,
-- connaissaient deja les profs invites depuis 16_exam_manage.sql. Et la
-- politique de lecture de `classes` ne laissait passer que le proprietaire.
--
-- Ce script ajoute la branche "prof invite" aux trois endroits manquants.
-- Il n'ouvre rien de neuf : le prof invite lit deja les reponses et les
-- corriges des memes epreuves (16_exam_manage.sql). Il lui manquait seulement
-- de quoi les afficher.
--
-- Ce script est re-executable sans danger.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. can_read_section
--
--    Gouverne la lecture de `question_groups` et `assignment_questions`.
--    La branche ajoutee passe par is_exam_staff_of_assignment, qui remonte
--    exam_session_items -> exam_session_staff : elle ne vaut donc QUE pour les
--    epreuves reellement posees dans une session ou ce prof est invite.
-- ---------------------------------------------------------------------------
create or replace function public.can_read_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- prof invite sur la session qui contient cette epreuve
    exists (
      select 1
      from exam_sections s
      where s.id = p_section_id
        and public.is_exam_staff_of_assignment(s.assignment_id)
    )
    -- comportement d'origine : prof proprietaire, ou etudiant inscrit
    or exists (
      select 1
      from exam_sections s
      join assignments a on a.id = s.assignment_id
      where s.id = p_section_id
        and ( exists (select 1 from classes c where c.id = a.class_id and c.teacher_id = auth.uid())
           or exists (select 1 from roster  r where r.class_id = a.class_id and r.student_id = auth.uid()) )
    );
$$;

revoke execute on function public.can_read_section(uuid) from public, anon;
grant  execute on function public.can_read_section(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. can_read_question
--
--    Gouverne la lecture de `questions` — y compris la jointure imbriquee
--    `questions(*)` que font les ecrans de correction et d'apercu.
-- ---------------------------------------------------------------------------
create or replace function public.can_read_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- prof invite sur la session qui contient cette question
    public.is_exam_staff_of_question(p_question_id)
    -- comportement d'origine : prof proprietaire, ou etudiant inscrit
    or exists (
      select 1
      from assignment_questions aq
      join exam_sections s on s.id = aq.section_id
      join assignments   a on a.id = s.assignment_id
      where aq.question_id = p_question_id
        and ( exists (select 1 from classes c where c.id = a.class_id and c.teacher_id = auth.uid())
           or exists (select 1 from roster  r where r.class_id = a.class_id and r.student_id = auth.uid()) )
    );
$$;

revoke execute on function public.can_read_question(uuid) from public, anon;
grant  execute on function public.can_read_question(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. La ligne de la classe-contenant de l'examen
--
--    IMPORTANT : on n'utilise surtout PAS is_class_teacher() ici. Cette
--    fonction relit la table `classes`, et une fonction SECURITY DEFINER qui
--    relit sa propre table dans une politique casse INSERT ... RETURNING :
--    creer une classe deviendrait impossible. C'est exactement le bug que
--    13_fix_create_assignment.sql avait du reparer en urgence.
--
--    On passe donc par une fonction dediee qui ne lit QUE exam_sessions et
--    exam_session_staff, et on l'ajoute comme politique separee : la politique
--    d'origine reste intacte, les deux s'additionnent.
-- ---------------------------------------------------------------------------
create or replace function public.is_exam_container_staff(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from exam_sessions e
    join exam_session_staff s on s.session_id = e.id
    where e.container_class_id = p_class_id
      and s.teacher_id = auth.uid()
  );
$$;

revoke execute on function public.is_exam_container_staff(uuid) from public, anon;
grant  execute on function public.is_exam_container_staff(uuid) to authenticated;

drop policy if exists "classes readable by exam staff" on public.classes;
create policy "classes readable by exam staff"
  on public.classes
  for select
  using (public.is_exam_container_staff(id));

commit;

-- ============================================================================
-- Verification rapide (facultatif) : remplacer l'uuid par celui du prof invite
-- et l'identifiant de session, puis executer. Tout doit etre > 0.
--
-- begin;
--   create temp table res(etape text, n bigint) on commit drop;
--   grant all on res to authenticated;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid-du-prof-invite>","role":"authenticated"}';
--   insert into res select 'classes',              count(*) from classes;
--   insert into res select 'question_groups',      count(*) from question_groups;
--   insert into res select 'assignment_questions', count(*) from assignment_questions;
--   insert into res select 'questions',            count(*) from questions;
--   reset role;
--   select * from res order by 1;
-- rollback;
-- ============================================================================
