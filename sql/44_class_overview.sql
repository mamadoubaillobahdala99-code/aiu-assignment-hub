-- =====================================================================
-- 44_class_overview.sql — livraison 70
-- Les chiffres de la page d'une classe (côté prof), en UNE lecture :
--   - combien d'étudiants ont rendu chaque devoir (« 8/12 ») ;
--   - combien de copies Writing attendent la correction (« à corriger ») ;
--   - pour chaque étudiant, combien de devoirs il a rendus ;
--   - pour chaque devoir, s'il a été construit (a des parties) : seul un
--     devoir construit peut être dupliqué.
--
-- LECTURE SEULEMENT : la fonction ne modifie rien.
-- SÉCURITÉ : seul le prof de CETTE classe obtient les chiffres (sinon
-- « Not allowed ») ; jamais anon ; jamais la boîte privée d'un examen.
-- Aucune réponse, aucun texte, aucune note n'est renvoyé : que des nombres.
--
-- Les règles de « rendu » sont EXACTEMENT celles de la page d'un devoir :
--   - Reading / Listening (épreuve construite) : a des réponses OU sa
--     copie est marquée remise (exam_attempts.submitted_at) ;
--   - Writing : un texte remis (writing_responses.submitted_at) ;
--     « à corriger » = remis, mais correction pas encore publiée ;
--   - Speaking : « vu » (speaking_views) — rien n'est remis ;
--   - devoir sans partie (ancien ou inachevé) : rien ne peut être rendu.
-- Seuls les étudiants encore inscrits dans la classe sont comptés.
--
-- Script complet et ré-exécutable. Attendu : 4 lignes « OK ».
-- Retour arrière : bloc tout en bas.
-- =====================================================================

begin;

create or replace function public.class_overview(p_class_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ok boolean;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select exists (select 1 from classes c
                 where c.id = p_class_id and c.teacher_id = auth.uid() and coalesce(c.kind, 'class') = 'class')
    into v_ok;
  if not v_ok then raise exception 'Not allowed'; end if;

  with st as (
    select r.student_id from roster r where r.class_id = p_class_id
  ),
  a as (
    select x.id, x.type,
           exists (select 1 from exam_sections s where s.assignment_id = x.id) as structured
    from assignments x
    where x.class_id = p_class_id
  ),
  done as (
    -- One row per (assignment, student) that counts as handed in / viewed.
    select a.id as assignment_id, st.student_id
    from a join st on true
    where a.structured and (
      case
        when a.type = 'Speaking' then
          exists (select 1 from speaking_views v where v.assignment_id = a.id and v.student_id = st.student_id)
        when a.type = 'Writing' then
          exists (select 1 from writing_responses w where w.assignment_id = a.id and w.student_id = st.student_id and w.submitted_at is not null)
        else
          exists (select 1 from student_answers sa where sa.assignment_id = a.id and sa.student_id = st.student_id)
          or exists (select 1 from exam_attempts t where t.assignment_id = a.id and t.student_id = st.student_id and t.submitted_at is not null)
      end)
  ),
  per_a as (
    select a.id, a.structured,
           (select count(*) from done d where d.assignment_id = a.id) as handed_in,
           case when a.type = 'Writing' then
             (select count(*) from done d
               where d.assignment_id = a.id
                 and not exists (select 1 from assignment_feedback f
                                  where f.assignment_id = a.id and f.student_id = d.student_id and f.released_at is not null))
           else 0 end as to_mark
    from a
  ),
  per_s as (
    select st.student_id, (select count(*) from done d where d.student_id = st.student_id) as done
    from st
  )
  select jsonb_build_object(
    'students', (select count(*) from st),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'structured', structured, 'handed_in', handed_in, 'to_mark', to_mark)) from per_a), '[]'::jsonb),
    'students_done', coalesce((select jsonb_agg(jsonb_build_object('student_id', student_id, 'done', done)) from per_s), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.class_overview(uuid) from public, anon;
grant execute on function public.class_overview(uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------
-- CONTRÔLES (lecture seule) — chaque ligne doit afficher « OK »
-- ---------------------------------------------------------------------
select '1. class_overview existe, en « security definer », search_path = public' as controle,
       case when exists (select 1 from pg_proc where oid = 'public.class_overview(uuid)'::regprocedure
                           and prosecdef and proconfig @> array['search_path=public'])
            then 'OK' else 'PROBLEME' end as resultat
union all
select '2. lecture seule (STABLE : ne peut rien modifier)',
       case when (select provolatile from pg_proc where oid = 'public.class_overview(uuid)'::regprocedure) = 's'
            then 'OK' else 'PROBLEME' end
union all
select '3. connectés seulement, jamais anon',
       case when has_function_privilege('authenticated', 'public.class_overview(uuid)', 'execute')
             and not has_function_privilege('anon', 'public.class_overview(uuid)', 'execute') then 'OK' else 'PROBLEME' end
union all
select '4. anon n''a toujours aucun droit sur les tables de public',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLEME' end;

/* =====================================================================
   RETOUR ARRIÈRE — retire la fonction (rien d'autre n'a été changé).

begin;
drop function if exists public.class_overview(uuid);
commit;

   ===================================================================== */
