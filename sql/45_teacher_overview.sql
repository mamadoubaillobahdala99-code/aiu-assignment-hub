-- =====================================================================
-- 45_teacher_overview.sql — livraison 72
-- Le tableau de bord du prof et ses cartes « My classes », en UNE lecture,
-- pour TOUTES ses classes à la fois :
--   - par classe : étudiants, devoirs, copies Writing à corriger ;
--   - par devoir : combien l'ont rendu (« 8/12 »), combien de copies
--     attendent la correction et depuis quand (« la plus ancienne ») ;
--   - le nombre d'étudiants (chacun compté une fois) et de copies rendues
--     ces 7 derniers jours ;
--   - l'activité récente (8 dernières) : « X a rendu tel devoir »,
--     « X a rejoint telle classe ».
--
-- LECTURE SEULEMENT : la fonction ne modifie rien (STABLE).
-- SÉCURITÉ : on ne lit QUE les classes dont l'appelant est le prof
-- (classes.teacher_id = auth.uid()), jamais la boîte privée d'un examen ;
-- jamais anon. Un étudiant qui l'appelle reçoit des listes vides.
-- Renvoyé : des nombres, des heures, et le nom des étudiants DE SES
-- classes (le prof les voit déjà dans ses classes). Aucune réponse, aucun
-- texte, aucune note.
--
-- Les règles de « rendu » sont EXACTEMENT celles du script 44
-- (class_overview) et de la page d'un devoir :
--   - Reading / Listening (épreuve construite) : a des réponses OU sa
--     copie est marquée remise (exam_attempts.submitted_at) ;
--   - Writing : un texte remis (writing_responses.submitted_at) ;
--     « à corriger » = remis, mais correction pas encore publiée ;
--   - Speaking : « vu » (speaking_views) — compte comme fait, mais n'est
--     ni une copie rendue (chiffre des 7 jours) ni une activité ;
--   - devoir sans partie : rien ne peut être rendu.
-- Seuls les étudiants encore inscrits dans la classe sont comptés.
--
-- Script complet et ré-exécutable. Attendu : 4 lignes « OK ».
-- Retour arrière : bloc tout en bas.
-- =====================================================================

begin;

create or replace function public.teacher_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  with cl as (
    select c.id, c.name, c.code, c.created_at
    from classes c
    where c.teacher_id = v_uid and coalesce(c.kind, 'class') = 'class'
  ),
  st as (
    select r.class_id, r.student_id, r.joined_at
    from roster r join cl on cl.id = r.class_id
  ),
  a as (
    select x.id, x.class_id, x.type,
           exists (select 1 from exam_sections s where s.assignment_id = x.id) as structured
    from assignments x join cl on cl.id = x.class_id
  ),
  -- One row per (assignment, enrolled student): handed in / viewed or not
  -- (same test as script 44), and WHEN, if the time is known.
  pair as (
    select a.id as assignment_id, a.class_id, a.type, st.student_id,
      case
        when a.type = 'Speaking' then
          exists (select 1 from speaking_views v where v.assignment_id = a.id and v.student_id = st.student_id)
        when a.type = 'Writing' then
          exists (select 1 from writing_responses w where w.assignment_id = a.id and w.student_id = st.student_id and w.submitted_at is not null)
        else
          exists (select 1 from student_answers sa where sa.assignment_id = a.id and sa.student_id = st.student_id)
          or exists (select 1 from exam_attempts t where t.assignment_id = a.id and t.student_id = st.student_id and t.submitted_at is not null)
      end as done,
      case
        when a.type = 'Speaking' then
          (select min(v.first_viewed_at) from speaking_views v where v.assignment_id = a.id and v.student_id = st.student_id)
        when a.type = 'Writing' then
          (select max(w.submitted_at) from writing_responses w where w.assignment_id = a.id and w.student_id = st.student_id and w.submitted_at is not null)
        else
          coalesce((select max(t.submitted_at) from exam_attempts t where t.assignment_id = a.id and t.student_id = st.student_id and t.submitted_at is not null),
                   (select max(sa.answered_at) from student_answers sa where sa.assignment_id = a.id and sa.student_id = st.student_id))
      end as at
    from a join st on st.class_id = a.class_id
    where a.structured
  ),
  done as (
    select p.*,
           (p.type = 'Writing' and not exists (
              select 1 from assignment_feedback f
               where f.assignment_id = p.assignment_id and f.student_id = p.student_id and f.released_at is not null)) as waiting
    from pair p
    where p.done
  ),
  per_a as (
    select a.id, a.class_id,
           (select count(*) from done d where d.assignment_id = a.id) as handed_in,
           (select count(*) from done d where d.assignment_id = a.id and d.waiting) as to_mark,
           (select min(d.at) from done d where d.assignment_id = a.id and d.waiting) as oldest
    from a
  ),
  per_c as (
    select cl.id, cl.name, cl.code, cl.created_at,
           (select count(*) from st where st.class_id = cl.id) as students,
           (select count(*) from a where a.class_id = cl.id) as assignments,
           (select coalesce(sum(p.to_mark), 0) from per_a p where p.class_id = cl.id) as to_mark
    from cl
  ),
  events as (
    select 'handed_in'::text as kind, d.class_id, d.assignment_id, d.student_id, d.at
    from done d
    where d.type <> 'Speaking' and d.at is not null
    union all
    select 'joined', st.class_id, null::uuid, st.student_id, st.joined_at
    from st
    where st.joined_at is not null
  ),
  recent as (
    select e.*, pr.name as student_name
    from events e left join profiles pr on pr.id = e.student_id
    order by e.at desc
    limit 8
  )
  select jsonb_build_object(
    'classes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'code', code, 'created_at', created_at,
        'students', students, 'assignments', assignments, 'to_mark', to_mark) order by created_at desc) from per_c), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'class_id', class_id, 'handed_in', handed_in, 'to_mark', to_mark, 'oldest', oldest)) from per_a), '[]'::jsonb),
    'students', (select count(distinct student_id) from st),
    'handed_in_7d', (select count(*) from done d where d.type <> 'Speaking' and d.at >= now() - interval '7 days'),
    'recent', coalesce((select jsonb_agg(jsonb_build_object(
        'kind', kind, 'class_id', class_id, 'assignment_id', assignment_id,
        'student_name', student_name, 'at', at) order by at desc) from recent), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.teacher_overview() from public, anon;
grant execute on function public.teacher_overview() to authenticated;

commit;

select '1. teacher_overview existe, en « security definer », search_path = public' as controle,
       case when exists (select 1 from pg_proc where oid = 'public.teacher_overview()'::regprocedure
                           and prosecdef and proconfig @> array['search_path=public'])
            then 'OK' else 'PROBLEME' end as resultat
union all
select '2. lecture seule (STABLE : ne peut rien modifier)',
       case when (select provolatile from pg_proc where oid = 'public.teacher_overview()'::regprocedure) = 's'
            then 'OK' else 'PROBLEME' end
union all
select '3. connectés seulement, jamais anon',
       case when has_function_privilege('authenticated', 'public.teacher_overview()', 'execute')
             and not has_function_privilege('anon', 'public.teacher_overview()', 'execute') then 'OK' else 'PROBLEME' end
union all
select '4. anon n''a toujours aucun droit sur les tables de public',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLEME' end;

/* =====================================================================
   RETOUR ARRIÈRE — retire la fonction (rien d'autre n'a été changé).

begin;
drop function if exists public.teacher_overview();
commit;

   ===================================================================== */
