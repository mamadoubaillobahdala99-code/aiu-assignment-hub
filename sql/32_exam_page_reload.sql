-- =====================================================================
-- 32_exam_page_reload.sql — livraison 47
-- Détecter qu'un paper d'examen en cours a été ROUVERT (F5, bouton
-- Retour puis Continue, deuxième onglet, onglet fermé puis rouvert,
-- autre appareil) : l'incident est noté et la copie gèle, comme Échap.
--
-- COMMENT : chaque ouverture de l'écran du paper crée un numéro aléatoire
--   (gardé en mémoire dans la page seulement). Il est envoyé au Start et à
--   chaque appel du chrono (exam_timer_status). La base retient le numéro
--   de l'écran où l'épreuve est ouverte. Un AUTRE numéro, pendant une
--   épreuve commencée, pas rendue, dans le temps, d'un examen ouvert
--   = le paper a été rouvert -> incident « page_reload ».
--   Plusieurs appels depuis le même écran (Try again, resynchronisation,
--   déblocage puis Continue) ne gèlent donc JAMAIS.
--
-- NE GÈLE PAS : avant Start, après la remise, après la fin du temps, examen
--   fermé ou résultats publiés, classe ordinaire, examen non strict (noté
--   seulement), appel sans numéro (ancien site encore ouvert pendant la mise
--   en place — règle à retirer quelques jours après la mise en ligne).
--   Épreuve commencée avant cette livraison : le premier numéro est adopté
--   sans gel.
--
-- SÉCURITÉ : le numéro est rangé dans une table que personne ne peut lire
--   (RLS activée, aucune règle, aucun droit pour anon ni authenticated) ;
--   seules les fonctions de la base y accèdent.
--
-- Script complet et ré-exécutable. À exécuter hors d'un examen en cours,
-- AVANT de coller les fichiers du site sur GitHub.
-- =====================================================================

-- 1. Le numéro de l'écran où chaque épreuve est ouverte (illisible pour tous).
create table if not exists public.exam_attempt_pages (
  assignment_id uuid        not null,
  student_id    uuid        not null,
  page_token    uuid        not null,
  updated_at    timestamptz not null default now(),
  primary key (assignment_id, student_id),
  foreign key (assignment_id, student_id)
    references public.exam_attempts (assignment_id, student_id) on delete cascade
);
alter table public.exam_attempt_pages enable row level security;
-- aucune règle : on retire celles qui existeraient
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'exam_attempt_pages' loop
    execute format('drop policy %I on public.exam_attempt_pages', p.policyname);
  end loop;
end $$;
-- aucun droit (Supabase en donne à tout le monde sur une nouvelle table)
revoke all on public.exam_attempt_pages from public, anon, authenticated;

-- 2. Le nouveau type d'incident.
alter table public.exam_incidents drop constraint if exists exam_incidents_kind_check;
alter table public.exam_incidents add constraint exam_incidents_kind_check
  check (kind = any (array['fullscreen_exit', 'tab_switch', 'paste', 'context_menu', 'copy', 'page_reload']));

-- 3. Le chrono reçoit le numéro de l'écran.
--    Ajouter un paramètre crée une deuxième version de la fonction, que
--    Supabase ne saurait pas départager : on supprime donc l'ancienne.
--    Le nouveau paramètre a une valeur par défaut : les appels à 2
--    arguments (ancien site, exam_start_item) marchent toujours.
drop function if exists public.exam_timer_status(uuid, boolean);

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

-- 4. Vérification (lecture seule) : chaque ligne doit afficher « OK ».
select 'table du numéro : RLS activée' as controle,
       case when (select relrowsecurity from pg_class where oid = 'public.exam_attempt_pages'::regclass) then 'OK' else 'PROBLÈME' end as resultat
union all
select 'table du numéro : aucune règle',
       case when not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'exam_attempt_pages') then 'OK' else 'PROBLÈME' end
union all
select 'table du numéro : aucun droit pour anon ni authenticated',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and table_name = 'exam_attempt_pages'
                               and grantee in ('anon', 'authenticated', 'PUBLIC')) then 'OK' else 'PROBLÈME' end
union all
select 'exam_timer_status : une seule version (3 paramètres)',
       case when (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'exam_timer_status') = 1
             and (select pronargs from pg_proc where pronamespace = 'public'::regnamespace and proname = 'exam_timer_status') = 3 then 'OK' else 'PROBLÈME' end
union all
select 'exam_timer_status : security definer + search_path = public',
       case when (select prosecdef and proconfig @> array['search_path=public'] from pg_proc where pronamespace = 'public'::regnamespace and proname = 'exam_timer_status') then 'OK' else 'PROBLÈME' end
union all
select 'exam_timer_status : exécutable par authenticated seulement (ni public ni anon)',
       case when has_function_privilege('authenticated', 'public.exam_timer_status(uuid, boolean, uuid)', 'execute')
             and not has_function_privilege('anon', 'public.exam_timer_status(uuid, boolean, uuid)', 'execute')
             and not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                             where p.pronamespace = 'public'::regnamespace and p.proname = 'exam_timer_status'
                               and a.grantee = 0 and a.privilege_type = 'EXECUTE') then 'OK' else 'PROBLÈME' end
union all
select 'nouveau type d''incident page_reload accepté',
       case when pg_get_constraintdef((select oid from pg_constraint where conname = 'exam_incidents_kind_check')) like '%page_reload%' then 'OK' else 'PROBLÈME' end;

-- =====================================================================
-- RETOUR ARRIÈRE (seulement pour annuler cette livraison).
-- Remet exam_timer_status d'avant (2 paramètres, mêmes protections),
-- l'ancienne liste des types d'incident, et supprime la table du numéro.
-- Les incidents « page_reload » déjà notés sont gardés (historique) : la
-- règle est alors remise sans revérifier ces lignes (NOT VALID), puis
-- revérifiée s'il n'y en a aucune.
-- ATTENTION : recoller aussi, sur GitHub, les fichiers du site d'avant la 47.
-- Mode d'emploi : copier tout ce qui se trouve ENTRE les lignes /* et */
-- ci-dessous (sans ces deux lignes), le coller dans l'éditeur SQL, Run.
-- =====================================================================
/*
drop function if exists public.exam_timer_status(uuid, boolean, uuid);

create or replace function public.exam_timer_status(p_assignment_id uuid, p_start boolean)
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
  v_is_exam    boolean;
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

  select started_at into v_started
  from exam_attempts
  where assignment_id = p_assignment_id and student_id = v_student_id;

  return jsonb_build_object(
    'started_at', v_started,
    'server_now', now(),
    'time_limit_minutes', v_limit
  );
end;
$$;

revoke all on function public.exam_timer_status(uuid, boolean) from public, anon;
grant execute on function public.exam_timer_status(uuid, boolean) to authenticated;

alter table public.exam_incidents drop constraint if exists exam_incidents_kind_check;
alter table public.exam_incidents add constraint exam_incidents_kind_check
  check (kind = any (array['fullscreen_exit', 'tab_switch', 'paste', 'context_menu', 'copy'])) not valid;
do $$
begin
  if not exists (select 1 from public.exam_incidents where kind = 'page_reload') then
    alter table public.exam_incidents validate constraint exam_incidents_kind_check;
  end if;
end $$;

drop table if exists public.exam_attempt_pages;
*/
