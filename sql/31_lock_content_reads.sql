-- =====================================================================
-- 31_lock_content_reads.sql — livraison 46
-- Fermer la lecture directe des groupes et des questions des papers
-- verrouillés (épreuve pas encore ouverte, examen fermé, épreuve déjà
-- rendue avant la publication des résultats).
--
-- AVANT : un candidat reste inscrit dans le conteneur d'examen ; les règles
--   de lecture des groupes, des liens et des questions ne regardaient que
--   l'inscription. Il pouvait donc lire (console du navigateur) les textes
--   et les questions d'une épreuve verrouillée. Les bonnes réponses et les
--   fichiers, eux, étaient déjà protégés.
--
-- APRÈS : un groupe, un lien ou une question se lit si et seulement si on
--   peut lire le PAPER lui-même (can_read_assignment : la règle qui protège
--   déjà la ligne du paper et ses parties, verrous d'examen compris), ou si
--   on est prof invité sur la session (branche du script 20, gardée).
--   -> Personne ne gagne d'accès. Seul un candidat perd la lecture des
--      épreuves qu'il ne peut pas ouvrir.
--   -> Le prof propriétaire n'est pas concerné (ses règles « propriétaire »
--      sur ces tables passent en premier) ; le prof invité non plus.
--
-- VITESSE : la liste des papers lisibles est calculée UNE fois par requête
--   (readable_paper_ids), au lieu de refaire le calcul des verrous pour
--   chaque question. Mesuré sur la vraie base (candidat) : get_paper
--   140 ms -> 97 ms, chargement de secours 411 ms -> 27 ms.
--
-- EN PLUS : le rôle anon (visiteur non connecté) perd le droit SELECT sur
--   les 4 tables de contenu. Aucun écran ne les lit avant la connexion.
--
-- Aucune table n'est modifiée, aucune donnée n'est touchée.
-- Script complet et ré-exécutable. À exécuter hors d'un examen en cours.
-- =====================================================================

-- 1. Les papers que la personne connectée peut lire (calculé une fois par requête).
create or replace function public.readable_paper_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
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
$$;

-- 2. Les parties de ces papers.
create or replace function public.readable_section_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from exam_sections s
  where s.assignment_id in (select public.readable_paper_ids());
$$;

-- 3. Les questions de ces papers.
create or replace function public.readable_question_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select aq.question_id
  from assignment_questions aq
  join exam_sections s on s.id = aq.section_id
  where s.assignment_id in (select public.readable_paper_ids());
$$;

-- 4. Les deux fonctions de lecture, même règle (validées dans le plan de la 46).
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
    where s.id = p_section_id
      and (
        -- le paper est lisible : prof propriétaire, prof invité, élève
        -- d'une classe, candidat seulement si l'épreuve est ouverte pour lui
        public.can_read_assignment(s.assignment_id)
        -- prof invité sur la session qui contient cette épreuve (script 20)
        or public.is_exam_staff_of_assignment(s.assignment_id)
      )
  );
$$;

create or replace function public.can_read_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.readable_paper_ids()      from public, anon;
revoke all on function public.readable_section_ids()    from public, anon;
revoke all on function public.readable_question_ids()   from public, anon;
revoke all on function public.can_read_section(uuid)    from public, anon;
revoke all on function public.can_read_question(uuid)   from public, anon;
grant execute on function public.readable_paper_ids()    to authenticated;
grant execute on function public.readable_section_ids()  to authenticated;
grant execute on function public.readable_question_ids() to authenticated;
grant execute on function public.can_read_section(uuid)  to authenticated;
grant execute on function public.can_read_question(uuid) to authenticated;

-- 5. Les 3 règles de lecture (mêmes noms qu'avant, nouvelle condition).
alter policy "groups readable by class members" on public.question_groups
  using (section_id in (select public.readable_section_ids()));
alter policy "links readable by class members" on public.assignment_questions
  using (section_id in (select public.readable_section_ids()));
alter policy "questions readable by class members" on public.questions
  using (id in (select public.readable_question_ids()));

-- 6. Le visiteur non connecté ne lit plus le contenu des papers.
revoke select on public.exam_sections        from anon;
revoke select on public.question_groups      from anon;
revoke select on public.assignment_questions from anon;
revoke select on public.questions            from anon;

-- 7. Vérification (lecture seule) : chaque ligne doit afficher « OK ».
select 'règle des groupes : liste des papers lisibles' as controle,
       case when (select qual from pg_policies where tablename = 'question_groups' and policyname = 'groups readable by class members') like '%readable_section_ids%' then 'OK' else 'PROBLÈME' end as resultat
union all
select 'règle des liens : liste des papers lisibles',
       case when (select qual from pg_policies where tablename = 'assignment_questions' and policyname = 'links readable by class members') like '%readable_section_ids%' then 'OK' else 'PROBLÈME' end
union all
select 'règle des questions : liste des papers lisibles',
       case when (select qual from pg_policies where tablename = 'questions' and policyname = 'questions readable by class members') like '%readable_question_ids%' then 'OK' else 'PROBLÈME' end
union all
select 'can_read_section et can_read_question passent par le paper',
       case when pg_get_functiondef('public.can_read_section'::regproc) like '%can_read_assignment%'
             and pg_get_functiondef('public.can_read_question'::regproc) like '%can_read_assignment%' then 'OK' else 'PROBLÈME' end
union all
select 'anon ne lit plus les 4 tables',
       case when not exists (
         select 1 from information_schema.role_table_grants
         where grantee = 'anon' and table_schema = 'public' and privilege_type = 'SELECT'
           and table_name in ('exam_sections', 'question_groups', 'assignment_questions', 'questions')
       ) then 'OK' else 'PROBLÈME' end;

-- =====================================================================
-- RETOUR ARRIÈRE (seulement pour annuler cette livraison).
-- Remet EXACTEMENT l'état d'avant : les 3 règles, les 2 fonctions du
-- script 20, le droit SELECT d'anon ; puis supprime les 3 fonctions ajoutées.
-- Mode d'emploi : copier tout ce qui se trouve ENTRE les lignes /* et */
-- ci-dessous (sans ces deux lignes), le coller dans l'éditeur SQL, Run.
-- =====================================================================
/*
alter policy "groups readable by class members" on public.question_groups
  using (can_read_section(section_id));
alter policy "links readable by class members" on public.assignment_questions
  using (can_read_section(section_id));
alter policy "questions readable by class members" on public.questions
  using (can_read_question(id));

create or replace function public.can_read_section(p_section_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
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

create or replace function public.can_read_question(p_question_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
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

revoke all on function public.can_read_section(uuid)  from public, anon;
revoke all on function public.can_read_question(uuid) from public, anon;
grant execute on function public.can_read_section(uuid)  to authenticated;
grant execute on function public.can_read_question(uuid) to authenticated;

drop function if exists public.readable_question_ids();
drop function if exists public.readable_section_ids();
drop function if exists public.readable_paper_ids();

grant select on public.exam_sections        to anon;
grant select on public.question_groups      to anon;
grant select on public.assignment_questions to anon;
grant select on public.questions            to anon;
*/
