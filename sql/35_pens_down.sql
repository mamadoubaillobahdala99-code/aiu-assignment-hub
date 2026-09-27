-- =====================================================================
-- 35_pens_down.sql — livraison 56 (point 4 de la liste)
-- « Posez les stylos » : c'est le SERVEUR qui ramasse les copies.
--
-- AVANT : quand le prof fermait l'examen, la page de l'étudiant ne le
--   savait pas ; s'il faisait F5 ensuite, son paper était refusé et ses
--   réponses de Reading/Listening, gardées seulement dans son navigateur,
--   n'étaient jamais remises. Un étudiant hors ligne à la fin du temps ne
--   remettait jamais rien non plus.
--
-- CE QUE FAIT CE FICHIER
--   1. exam_answer_drafts : les réponses de Reading/Listening en cours sont
--      aussi gardées sur le serveur (la page les envoie toutes les 5 s).
--      RLS activée, AUCUNE règle, AUCUN droit : personne ne peut la lire,
--      pas même l'étudiant ; seules les fonctions de la base y touchent.
--   2. save_answer_drafts(paper, réponses) : n'accepte que pour un CANDIDAT,
--      un paper d'examen Reading/Listening commencé, pas rendu, examen
--      ouvert, dans le temps (+5 min, comme la remise).
--   3. exam_collect_papers(session, tout) : le ramassage. Pour chaque copie
--      commencée et pas rendue de la session :
--        - tout = vrai  : toutes (fermeture, publication, examen plus ouvert) ;
--        - tout = faux  : seulement celles dont le temps est écoulé (+5 min).
--      Reading/Listening : les brouillons sont notés (comme une remise
--      normale) ; Writing : les textes déjà sauvegardés sont remis. Une copie
--      gelée est ramassée comme les autres. Une copie en train d'être remise
--      par l'étudiant au même instant est laissée à cette remise.
--      Personne ne peut l'appeler directement (aucun droit).
--   4. « Close » (et « Release ») ramassent tout, dans la même opération.
--   5. Ramassage « au passage », sans attendre la fermeture : à chaque
--      question d'une page d'épreuve (toutes les 5 s) et à chaque
--      rafraîchissement du tableau du prof.
--
-- Script complet et ré-exécutable. Attendu : 9 lignes « OK ».
-- À exécuter hors d'un examen en cours, AVANT de coller les fichiers du site.
-- Retour arrière : bloc tout en bas.
-- =====================================================================

begin;

-- 1. Les brouillons de Reading/Listening (illisibles pour tous).
create table if not exists public.exam_answer_drafts (
  assignment_id uuid        not null,
  student_id    uuid        not null,
  answers       jsonb       not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (assignment_id, student_id),
  foreign key (assignment_id, student_id)
    references public.exam_attempts (assignment_id, student_id) on delete cascade
);
alter table public.exam_answer_drafts enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'exam_answer_drafts' loop
    execute format('drop policy %I on public.exam_answer_drafts', p.policyname);
  end loop;
end $$;
revoke all on public.exam_answer_drafts from public, anon, authenticated;

-- 2. Sauvegarder les brouillons.
create or replace function public.save_answer_drafts(p_assignment_id uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_student  uuid := auth.uid();
  v_type     text;
  v_limit    integer;
  v_session  uuid;
  v_released timestamptz;
  v_started  timestamptz;
  v_submitted timestamptz;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;

  select a.type, a.time_limit_minutes into v_type, v_limit from assignments a where a.id = p_assignment_id;
  if v_type is null or v_type not in ('Reading', 'Listening') then
    raise exception 'Not a Reading or Listening paper';
  end if;

  select e.id, e.results_released_at into v_session, v_released
  from exam_session_items i join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;
  if v_session is null then
    return jsonb_build_object('saved', false, 'reason', 'not_exam');
  end if;
  if not public.is_exam_candidate(v_session) then raise exception 'Not allowed'; end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'Invalid answers'; end if;
  if (select count(*) from jsonb_object_keys(p_answers)) > 500 or length(p_answers::text) > 200000 then
    raise exception 'Too many answers';
  end if;

  select started_at, submitted_at into v_started, v_submitted
  from exam_attempts where assignment_id = p_assignment_id and student_id = v_student;
  if v_started is null then return jsonb_build_object('saved', false, 'reason', 'not_started'); end if;
  if v_submitted is not null then return jsonb_build_object('saved', false, 'reason', 'submitted'); end if;
  if v_released is not null or not public.exam_is_open(v_session) then
    return jsonb_build_object('saved', false, 'reason', 'closed');
  end if;
  if v_limit is not null and now() > v_started + make_interval(mins => v_limit + 5) then
    return jsonb_build_object('saved', false, 'reason', 'time');
  end if;

  insert into exam_answer_drafts (assignment_id, student_id, answers, updated_at)
  values (p_assignment_id, v_student, p_answers, now())
  on conflict (assignment_id, student_id) do update
    set answers = excluded.answers, updated_at = now();

  return jsonb_build_object('saved', true);
end $$;

revoke all on function public.save_answer_drafts(uuid, jsonb) from public, anon;
grant execute on function public.save_answer_drafts(uuid, jsonb) to authenticated;

-- 3. Le ramassage.
create or replace function public.exam_collect_papers(p_session_id uuid, p_all boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_att   record;
  v_key   text;
  v_value jsonb;
  v_qid   uuid;
  v_ok    boolean;
  v_pts   numeric;
  v_count integer := 0;
begin
  for v_att in
    select a.assignment_id, a.student_id, p.type
    from exam_session_items i
    join assignments p   on p.id = i.assignment_id
    join exam_attempts a on a.assignment_id = i.assignment_id
    where i.session_id = p_session_id
      and a.submitted_at is null
      and p.type in ('Reading', 'Listening', 'Writing')
      and (p_all or (p.time_limit_minutes is not null
                     and now() > a.started_at + make_interval(mins => p.time_limit_minutes + 5)))
    for update of a skip locked          -- une remise en cours au même instant garde la main
  loop
   -- Une copie qui poserait un problème imprévu est laissée pour le passage
   -- suivant : elle ne doit JAMAIS empêcher la fermeture pour toute la salle.
   begin
    if v_att.type in ('Reading', 'Listening') then
      -- Comme une remise normale : seulement si aucune réponse n'est déjà notée.
      if not exists (select 1 from student_answers sa
                     where sa.assignment_id = v_att.assignment_id and sa.student_id = v_att.student_id) then
        for v_key, v_value in
          select d.key, d.value
          from exam_answer_drafts x, jsonb_each(x.answers) d
          where x.assignment_id = v_att.assignment_id and x.student_id = v_att.student_id
        loop
          begin
            v_qid := v_key::uuid;
          exception when others then
            continue;                     -- une clé qui n'est pas une question : ignorée
          end;
          if exists (select 1 from assignment_questions aq join exam_sections s on s.id = aq.section_id
                     where aq.question_id = v_qid and s.assignment_id = v_att.assignment_id) then
            -- Une réponse mal formée (pas la forme attendue pour ce type de
            -- question) est gardée, comptée fausse, et ne bloque rien.
            begin
              select g.is_correct, g.points_earned into v_ok, v_pts from grade_student_answer(v_qid, v_value) g;
            exception when others then
              v_ok := false; v_pts := 0;
            end;
            insert into student_answers (assignment_id, student_id, question_id, response, is_correct, points_earned)
            values (v_att.assignment_id, v_att.student_id, v_qid, v_value, coalesce(v_ok, false), coalesce(v_pts, 0))
            on conflict (student_id, question_id) do nothing;
          end if;
        end loop;
      end if;
    else
      -- Writing : comme submit_writing — une tâche jamais tapée a quand même sa ligne (vide).
      insert into writing_responses (assignment_id, section_id, student_id)
      select v_att.assignment_id, s.id, v_att.student_id
      from exam_sections s
      where s.assignment_id = v_att.assignment_id and s.task_number is not null
      on conflict (section_id, student_id) do nothing;
      update writing_responses set submitted_at = now()
       where assignment_id = v_att.assignment_id and student_id = v_att.student_id and submitted_at is null;
    end if;

    update exam_attempts set submitted_at = now()
     where assignment_id = v_att.assignment_id and student_id = v_att.student_id and submitted_at is null;
    delete from exam_answer_drafts where assignment_id = v_att.assignment_id and student_id = v_att.student_id;
    v_count := v_count + 1;
   exception when others then
    null;                               -- ramassée au prochain passage
   end;
  end loop;

  -- Plus besoin des brouillons des copies déjà rendues par les étudiants.
  delete from exam_answer_drafts x
   using exam_session_items i, exam_attempts a
   where i.session_id = p_session_id and x.assignment_id = i.assignment_id
     and a.assignment_id = x.assignment_id and a.student_id = x.student_id and a.submitted_at is not null;

  return v_count;
end $$;

-- Personne ne l'appelle directement : seulement les fonctions ci-dessous.
revoke all on function public.exam_collect_papers(uuid, boolean) from public, anon, authenticated;

-- 4. « Close » et « Release » ramassent tout.
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

-- 5. Ramassage au passage : le tableau du prof…
create or replace function public.exam_invigilation_board(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_out jsonb; v_class uuid;
begin
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;
  -- NOUVEAU (35) : ramassage au passage (copies dont le temps est écoulé ;
  -- toutes les copies en cours si l'examen n'est plus ouvert).
  perform public.exam_collect_papers(p_session_id, not public.exam_is_open(p_session_id)
          or exists (select 1 from exam_sessions e where e.id = p_session_id and e.results_released_at is not null));
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
end $$;

revoke all on function public.exam_invigilation_board(uuid) from public, anon;
grant execute on function public.exam_invigilation_board(uuid) to authenticated;

-- … et la question que pose chaque page d'épreuve toutes les 5 s.
create or replace function public.exam_my_invigilation(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := auth.uid();
  v_session uuid; v_strict boolean; v_row record;
  v_candidate boolean; v_closed boolean; v_released boolean; v_submitted boolean;
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

  -- NOUVEAU (34) : l'état de l'examen, pour un candidat seulement.
  select exists (select 1 from exam_sessions e join roster r on r.class_id = e.container_class_id
                 where e.id = v_session and r.student_id = v_student)
    into v_candidate;
  if v_candidate then
    -- NOUVEAU (35) : ramassage au passage, AVANT de dire « rendu » : un
    -- candidat revenu en ligne apprend dans la même réponse que sa copie a
    -- été remise.
    perform public.exam_collect_papers(v_session, not public.exam_is_open(v_session)
            or exists (select 1 from exam_sessions e where e.id = v_session and e.results_released_at is not null));
    select not public.exam_is_open(e.id), e.results_released_at is not null
      into v_closed, v_released
    from exam_sessions e where e.id = v_session;
    select coalesce(bool_or(a.submitted_at is not null), false) into v_submitted
    from exam_attempts a where a.assignment_id = p_assignment_id and a.student_id = v_student;
  end if;

  return jsonb_build_object(
    'watched', true,
    'strict', v_strict,
    'frozen', v_row.at is not null,
    'since', v_row.at,
    'kind', v_row.kind,
    'reason', v_row.reason,
    'session_id', v_session,
    'closed', v_closed,
    'released', v_released,
    'submitted', v_submitted
  );
end $$;

revoke all on function public.exam_my_invigilation(uuid) from public, anon;
grant execute on function public.exam_my_invigilation(uuid) to authenticated;

commit;

-- CONTRÔLES (lecture seule) — chaque ligne doit afficher « OK »
select 'brouillons : RLS activée' as controle,
       case when (select relrowsecurity from pg_class where oid = 'public.exam_answer_drafts'::regclass) then 'OK' else 'PROBLÈME' end as resultat
union all
select 'brouillons : aucune règle',
       case when not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'exam_answer_drafts') then 'OK' else 'PROBLÈME' end
union all
select 'brouillons : aucun droit pour anon ni authenticated',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and table_name = 'exam_answer_drafts'
                               and grantee in ('anon', 'authenticated', 'PUBLIC')) then 'OK' else 'PROBLÈME' end
union all
select 'save_answer_drafts : exécutable par authenticated seulement',
       case when has_function_privilege('authenticated', 'public.save_answer_drafts(uuid, jsonb)', 'execute')
             and not has_function_privilege('anon', 'public.save_answer_drafts(uuid, jsonb)', 'execute') then 'OK' else 'PROBLÈME' end
union all
select 'exam_collect_papers : exécutable par PERSONNE (ni authenticated ni anon)',
       case when not has_function_privilege('authenticated', 'public.exam_collect_papers(uuid, boolean)', 'execute')
             and not has_function_privilege('anon', 'public.exam_collect_papers(uuid, boolean)', 'execute') then 'OK' else 'PROBLÈME' end
union all
select 'les 4 fonctions : security definer + search_path = public',
       case when (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
                  and proname in ('save_answer_drafts', 'exam_collect_papers', 'exam_session_action', 'exam_invigilation_board')
                  and prosecdef and proconfig @> array['search_path=public']) = 4 then 'OK' else 'PROBLÈME' end
union all
select 'Close / Release ramassent les copies',
       case when pg_get_functiondef('public.exam_session_action(uuid, text, uuid)'::regprocedure) like '%exam_collect_papers(p_session_id, true)%' then 'OK' else 'PROBLÈME' end
union all
select 'ramassage au passage (tableau du prof + page d''épreuve)',
       case when pg_get_functiondef('public.exam_invigilation_board(uuid)'::regprocedure) like '%exam_collect_papers%'
             and pg_get_functiondef('public.exam_my_invigilation(uuid)'::regprocedure) like '%exam_collect_papers%' then 'OK' else 'PROBLÈME' end
union all
select 'toujours rien pour anon sur les tables de public (script 33)',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLÈME' end;

/* =====================================================================
   RETOUR ARRIÈRE — remet les 3 fonctions exactement comme les scripts 12,
   18 et 34 les avaient écrites, puis supprime ce que le 35 a ajouté.
   ATTENTION : les brouillons non encore ramassés sont perdus ; les copies
   déjà ramassées RESTENT remises. Recoller aussi, sur GitHub, les fichiers
   du site d'avant la 56.
   Sélectionner de la ligne « begin; » à la ligne « commit; » puis Run.

begin;
create or replace function public.exam_session_action(p_session_id uuid, p_action text, p_item_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
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
end $$;

create or replace function public.exam_invigilation_board(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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
end $$;

create or replace function public.exam_my_invigilation(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := auth.uid();
  v_session uuid; v_strict boolean; v_row record;
  v_candidate boolean; v_closed boolean; v_released boolean; v_submitted boolean;
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

  -- NOUVEAU (34) : l'état de l'examen, pour un candidat seulement.
  select exists (select 1 from exam_sessions e join roster r on r.class_id = e.container_class_id
                 where e.id = v_session and r.student_id = v_student)
    into v_candidate;
  if v_candidate then
    select not public.exam_is_open(e.id), e.results_released_at is not null
      into v_closed, v_released
    from exam_sessions e where e.id = v_session;
    select coalesce(bool_or(a.submitted_at is not null), false) into v_submitted
    from exam_attempts a where a.assignment_id = p_assignment_id and a.student_id = v_student;
  end if;

  return jsonb_build_object(
    'watched', true,
    'strict', v_strict,
    'frozen', v_row.at is not null,
    'since', v_row.at,
    'kind', v_row.kind,
    'reason', v_row.reason,
    'session_id', v_session,
    'closed', v_closed,
    'released', v_released,
    'submitted', v_submitted
  );
end $$;

revoke all on function public.exam_session_action(uuid, text, uuid) from public, anon;
grant execute on function public.exam_session_action(uuid, text, uuid) to authenticated;
revoke all on function public.exam_invigilation_board(uuid) from public, anon;
grant execute on function public.exam_invigilation_board(uuid) to authenticated;
revoke all on function public.exam_my_invigilation(uuid) from public, anon;
grant execute on function public.exam_my_invigilation(uuid) to authenticated;
drop function if exists public.save_answer_drafts(uuid, jsonb);
drop function if exists public.exam_collect_papers(uuid, boolean);
drop table if exists public.exam_answer_drafts;
commit;
   ===================================================================== */
