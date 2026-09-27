-- =====================================================================
-- 38_exam_timer_rule.sql — à exécuter le mardi 29/09/2026 (pas avant)
-- Trois petites fermetures autour de la surveillance des examens.
--
-- 1. exam_timer_status : la règle provisoire « appel sans numéro d'écran =
--    rien » (livraison 47, pour les pages restées ouvertes sur l'ancien site)
--    est retirée pour les papers d'EXAMEN : un appel sans numéro est
--    maintenant REFUSÉ (« Please reload the page »). Pas de gel. Les classes
--    ordinaires ne changent pas.
-- 2. exam_start_item : supprimée. Ancienne fonction que le site n'appelle
--    plus, mais que tout compte connecté pouvait appeler ; elle appelait
--    exam_timer_status SANS numéro.
-- 3. exam_my_invigilation : « watched », « strict » et le numéro de l'examen
--    ne sont plus donnés qu'aux CANDIDATS de l'examen et à son STAFF. Tout
--    autre compte connecté reçoit la même réponse qu'un devoir ordinaire.
--
-- Script complet et ré-exécutable. Attendu : 6 lignes « OK ».
-- À exécuter hors d'un examen en cours. Aucun fichier du site à coller.
-- Retour arrière : bloc tout en bas.
-- =====================================================================

begin;

-- 1. Le chrono : appel sans numéro refusé dans un paper d'examen.
create or replace function public.exam_timer_status(p_assignment_id uuid, p_start boolean, p_page uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  -- NOUVEAU (38) : dans un paper d'EXAMEN, un appel sans numéro d'écran est
  -- refusé. Le site envoie toujours ce numéro depuis la livraison 47 ; un
  -- appel sans numéro vient d'une très vieille page, ou de quelqu'un qui
  -- voudrait échapper à la surveillance « 2e onglet ». On ne gèle pas (une
  -- vieille page ne doit pas geler un étudiant) : on refuse, simplement.
  if p_page is null
     and exists (select 1 from exam_session_items i where i.assignment_id = p_assignment_id) then
    raise exception 'Please reload the page';
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
  if p_page is not null                      -- classe ordinaire sans numéro : rien
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
$$;

revoke all on function public.exam_timer_status(uuid, boolean, uuid) from public, anon;
grant execute on function public.exam_timer_status(uuid, boolean, uuid) to authenticated;

-- 2. L'ancienne porte d'entrée, plus utilisée.
drop function if exists public.exam_start_item(uuid);

-- 3. L'état de surveillance : candidats et staff seulement.
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

  -- NOUVEAU (38) : l'état de surveillance n'est donné qu'aux CANDIDATS de
  -- l'examen et à son STAFF. Tout autre compte connecté reçoit la même
  -- réponse qu'un devoir ordinaire (rien sur l'examen, ni son numéro).
  select exists (select 1 from exam_sessions e join roster r on r.class_id = e.container_class_id
                 where e.id = v_session and r.student_id = v_student)
    into v_candidate;
  if not v_candidate and not public.is_exam_staff(v_session) then
    return jsonb_build_object('watched', false, 'frozen', false, 'strict', false);
  end if;

  select x.at, x.kind, x.reason into v_row
  from exam_incidents x
  where x.session_id = v_session and x.student_id = v_student
    and x.freezes and x.cleared_at is null
  order by x.at limit 1;

  -- (34) : l'état de l'examen, pour un candidat seulement (v_candidate, plus haut).
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

-- ---------------------------------------------------------------------
-- CONTRÔLES (lecture seule) — chaque ligne doit afficher « OK »
-- ---------------------------------------------------------------------
select '1. chrono : appel sans numéro refusé dans un examen' as controle,
       case when (select prosrc from pg_proc where oid = 'public.exam_timer_status(uuid, boolean, uuid)'::regprocedure)
                 like '%Please reload the page%' then 'OK' else 'PROBLEME' end as resultat
union all
select '2. exam_start_item n''existe plus',
       case when not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'exam_start_item')
            then 'OK' else 'PROBLEME' end
union all
select '3. surveillance : réservée aux candidats et au staff',
       case when (select prosrc from pg_proc where oid = 'public.exam_my_invigilation(uuid)'::regprocedure)
                 like '%not v_candidate and not public.is_exam_staff(v_session)%' then 'OK' else 'PROBLEME' end
union all
select '4. les deux fonctions : connectés seulement, jamais anon',
       case when has_function_privilege('authenticated', 'public.exam_timer_status(uuid, boolean, uuid)', 'execute')
             and has_function_privilege('authenticated', 'public.exam_my_invigilation(uuid)', 'execute')
             and not has_function_privilege('anon', 'public.exam_timer_status(uuid, boolean, uuid)', 'execute')
             and not has_function_privilege('anon', 'public.exam_my_invigilation(uuid)', 'execute')
            then 'OK' else 'PROBLEME' end
union all
select '5. les deux fonctions : security definer, search_path = public',
       case when (select count(*) from pg_proc
                  where oid in ('public.exam_timer_status(uuid, boolean, uuid)'::regprocedure, 'public.exam_my_invigilation(uuid)'::regprocedure)
                    and prosecdef and proconfig @> array['search_path=public']) = 2 then 'OK' else 'PROBLEME' end
union all
select '6. anon n''a toujours aucun droit sur les tables de public',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLEME' end;

/* =====================================================================
   RETOUR ARRIÈRE — remet exam_timer_status (script 32), exam_my_invigilation
   (script 35) et recrée exam_start_item (script 12), avec leurs droits.

begin;

create or replace function public.exam_timer_status(p_assignment_id uuid, p_start boolean, p_page uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.exam_timer_status(uuid, boolean, uuid) from public, anon;
grant execute on function public.exam_timer_status(uuid, boolean, uuid) to authenticated;

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

revoke all on function public.exam_start_item(uuid) from public, anon;
grant execute on function public.exam_start_item(uuid) to authenticated, service_role;

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

   ===================================================================== */
