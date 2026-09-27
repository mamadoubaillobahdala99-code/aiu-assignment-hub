-- =====================================================================
-- 36_collect_safety.sql — livraison 57
-- Deux securites autour du ramassage des copies (livraison 56).
--
-- 1. submit_writing verrouille la ligne de la copie EN PREMIER, comme la
--    remise du Reading/Listening et comme le ramassage. Avant, l'ordre
--    etait inverse : si l'etudiant remettait son Writing pile au moment
--    ou le serveur ramassait, Postgres pouvait annuler l'une des deux
--    operations (« deadlock detected ») et l'etudiant voyait une erreur.
--    Maintenant : si le ramassage passe avant, l'etudiant recoit
--    « Already submitted » et sa page affiche « handed in ».
--    Dans une classe ordinaire (hors examen), rien ne change.
--
-- 2. exam_uncollected_papers(session) : le nombre de copies qui DEVRAIENT
--    etre ramassees et ne le sont pas encore (examen ferme ou publie, ou
--    temps + 5 min fini). Reserve au staff de l'examen. Le tableau du prof
--    l'affiche ; « Close » et « Release » le renvoient aussi.
--
-- Script complet et re-executable. Attendu : 6 lignes « OK ».
-- A executer hors d'un examen en cours, AVANT de coller les fichiers du site.
-- Retour arriere : bloc tout en bas.
-- =====================================================================

begin;

-- 1. Remise du Writing : meme ordre de verrouillage que le reste.
create or replace function public.submit_writing(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_student_id uuid := auth.uid();
  v_class_id   uuid;
  v_type       text;
  v_exam       record;
  v_had_copy   boolean;
  v_exam_paper boolean;
  v_submitted  timestamptz;
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
  v_exam_paper := found;

  if v_exam_paper then
    if v_exam.results_released_at is not null then
      raise exception 'This exam is over';
    end if;
    if v_exam.closed_at is not null and not v_had_copy then
      raise exception 'This exam is closed';
    end if;
  end if;

  -- NOUVEAU (36) : la ligne de la copie est verrouillee EN PREMIER, comme
  -- dans submit_student_answers et dans le ramassage (exam_collect_papers).
  -- Meme ordre partout = plus de blocage mutuel (deadlock) quand l'etudiant
  -- remet pile au moment ou le serveur ramasse. Si le ramassage passe
  -- avant, on attend qu'il finisse, puis on lit sa remise ici.
  insert into exam_attempts (assignment_id, student_id, started_at)
  values (p_assignment_id, v_student_id, now())
  on conflict (assignment_id, student_id) do nothing;

  select submitted_at into v_submitted
  from exam_attempts
  where assignment_id = p_assignment_id and student_id = v_student_id
  for update;

  -- Une copie rendue est ramassee : on ne la rend pas deux fois.
  -- (Le texte etait deja gele — save_writing_draft refuse d'ecrire
  -- apres le rendu — mais la fonction repondait quand meme "rendu".
  -- Dans une classe ordinaire, on ne change rien : le double envoi y
  -- reste sans effet et sans erreur, comme avant.)
  if v_exam_paper and v_submitted is not null then
    raise exception 'Already submitted';
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

  -- Le registre unique du rendu (sa ligne existe deja : voir plus haut).
  update exam_attempts
     set submitted_at = coalesce(submitted_at, now())
   where assignment_id = p_assignment_id and student_id = v_student_id;

  return jsonb_build_object('submitted', true);
end $function$;

revoke all on function public.submit_writing(uuid) from public, anon;
grant execute on function public.submit_writing(uuid) to authenticated;

-- 2. Ce qui reste a ramasser (staff de l'examen seulement).
create or replace function public.exam_uncollected_papers(p_session_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_all  boolean;
  v_left integer;
begin
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;

  -- Les memes copies que celles que le ramassage doit prendre :
  -- toutes si l'examen n'est plus ouvert ou publie, sinon celles dont
  -- le temps (+5 min) est fini.
  v_all := not public.exam_is_open(p_session_id)
           or exists (select 1 from exam_sessions e where e.id = p_session_id and e.results_released_at is not null);

  -- « skip locked » : une copie que l'etudiant est en train de remettre
  -- a cet instant n'est pas un echec — elle n'est pas comptee.
  select count(*) into v_left
  from (
    select 1
    from exam_session_items i
    join assignments p   on p.id = i.assignment_id
    join exam_attempts a on a.assignment_id = i.assignment_id
    where i.session_id = p_session_id
      and a.submitted_at is null
      and p.type in ('Reading', 'Listening', 'Writing')
      and (v_all or (p.time_limit_minutes is not null
                     and now() > a.started_at + make_interval(mins => p.time_limit_minutes + 5)))
    for update of a skip locked
  ) as s;

  return v_left;
end $$;

revoke all on function public.exam_uncollected_papers(uuid) from public, anon;
grant execute on function public.exam_uncollected_papers(uuid) to authenticated;

-- 3. « Close » et « Release » disent aussi ce qui n'a pas pu etre ramasse.
create or replace function public.exam_session_action(p_session_id uuid, p_action text, p_item_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := now(); v_collected integer := 0; v_left integer := 0;
begin
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;

  if p_action = 'open' then
    update exam_sessions set opened_at = coalesce(opened_at, v_now), closed_at = null where id = p_session_id;
  elsif p_action = 'close' then
    update exam_sessions set closed_at = v_now where id = p_session_id;
    -- NOUVEAU (35) : « posez les stylos » — toutes les copies en cours sont
    -- remises maintenant, telles qu'elles sont (brouillons du serveur).
    v_collected := public.exam_collect_papers(p_session_id, true);
    v_left := public.exam_uncollected_papers(p_session_id);      -- NOUVEAU (36)
  elsif p_action = 'release' then
    update exam_sessions set results_released_at = coalesce(results_released_at, v_now) where id = p_session_id;
    -- Les epreuves de cette session publient leurs resultats.
    update assignments set auto_release_score = true
     where id in (select assignment_id from exam_session_items where session_id = p_session_id);
    -- NOUVEAU (35) : une copie encore en cours ne peut plus être rendue après
    -- la publication : elle est remise maintenant.
    v_collected := public.exam_collect_papers(p_session_id, true);
    v_left := public.exam_uncollected_papers(p_session_id);      -- NOUVEAU (36)
  elsif p_action = 'start_audio' then
    if p_item_id is null then raise exception 'Which part?'; end if;
    update exam_session_items set audio_started_at = coalesce(audio_started_at, v_now)
     where id = p_item_id and session_id = p_session_id;
  else
    raise exception 'Unknown action';
  end if;

  return jsonb_build_object('ok', true, 'at', v_now, 'collected', v_collected, 'uncollected', v_left);
end $$;

revoke all on function public.exam_session_action(uuid, text, uuid) from public, anon;
grant execute on function public.exam_session_action(uuid, text, uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------
-- CONTROLES (lecture seule) — chaque ligne doit afficher « OK »
-- ---------------------------------------------------------------------
select '1. submit_writing verrouille la copie avant les textes' as controle,
       case when pg_get_functiondef('public.submit_writing(uuid)'::regprocedure) ~ 'for update;.*update writing_responses'
            then 'OK' else 'PROBLEME' end as resultat
union all
select '2. submit_writing : connectes seulement, jamais anon',
       case when has_function_privilege('authenticated', 'public.submit_writing(uuid)', 'execute')
             and not has_function_privilege('anon', 'public.submit_writing(uuid)', 'execute') then 'OK' else 'PROBLEME' end
union all
select '3. exam_uncollected_papers : connectes seulement, jamais anon',
       case when has_function_privilege('authenticated', 'public.exam_uncollected_papers(uuid)', 'execute')
             and not has_function_privilege('anon', 'public.exam_uncollected_papers(uuid)', 'execute') then 'OK' else 'PROBLEME' end
union all
select '4. fonctions en « security definer » avec search_path = public',
       case when (select count(*) from pg_proc
                  where oid in ('public.submit_writing(uuid)'::regprocedure,
                                'public.exam_uncollected_papers(uuid)'::regprocedure,
                                'public.exam_session_action(uuid, text, uuid)'::regprocedure)
                    and prosecdef and proconfig @> array['search_path=public']) = 3 then 'OK' else 'PROBLEME' end
union all
select '5. Close et Release renvoient le nombre de copies non ramassees',
       case when pg_get_functiondef('public.exam_session_action(uuid, text, uuid)'::regprocedure) like '%''uncollected''%'
            then 'OK' else 'PROBLEME' end
union all
select '6. anon n''a toujours aucun droit sur les tables de public',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLEME' end;

/* =====================================================================
   RETOUR ARRIERE — a executer seulement pour revenir a l'etat d'avant le 36
   (submit_writing du script 16, exam_session_action du script 35).
   =====================================================================

begin;

create or replace function public.submit_writing(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
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
end $function$;

revoke all on function public.submit_writing(uuid) from public, anon;
grant execute on function public.submit_writing(uuid) to authenticated;

create or replace function public.exam_session_action(p_session_id uuid, p_action text, p_item_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := now(); v_collected integer := 0;
begin
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;

  if p_action = 'open' then
    update exam_sessions set opened_at = coalesce(opened_at, v_now), closed_at = null where id = p_session_id;
  elsif p_action = 'close' then
    update exam_sessions set closed_at = v_now where id = p_session_id;
    -- NOUVEAU (35) : « posez les stylos » — toutes les copies en cours sont
    -- remises maintenant, telles qu'elles sont (brouillons du serveur).
    v_collected := public.exam_collect_papers(p_session_id, true);
  elsif p_action = 'release' then
    update exam_sessions set results_released_at = coalesce(results_released_at, v_now) where id = p_session_id;
    -- Les epreuves de cette session publient leurs resultats.
    update assignments set auto_release_score = true
     where id in (select assignment_id from exam_session_items where session_id = p_session_id);
    -- NOUVEAU (35) : une copie encore en cours ne peut plus être rendue après
    -- la publication : elle est remise maintenant.
    v_collected := public.exam_collect_papers(p_session_id, true);
  elsif p_action = 'start_audio' then
    if p_item_id is null then raise exception 'Which part?'; end if;
    update exam_session_items set audio_started_at = coalesce(audio_started_at, v_now)
     where id = p_item_id and session_id = p_session_id;
  else
    raise exception 'Unknown action';
  end if;

  return jsonb_build_object('ok', true, 'at', v_now, 'collected', v_collected);
end $$;

revoke all on function public.exam_session_action(uuid, text, uuid) from public, anon;
grant execute on function public.exam_session_action(uuid, text, uuid) to authenticated;

drop function if exists public.exam_uncollected_papers(uuid);

commit;

   ===================================================================== */
