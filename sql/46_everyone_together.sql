-- =====================================================================
-- 46_everyone_together.sql — livraison 79
-- « Everyone together » : le prof peut faire commencer chaque épreuve d'un
-- examen EN MÊME TEMPS pour tous les candidats.
--
-- RÉGLAGE DE L'EXAMEN (start_mode)
--   'individual' (PAR DÉFAUT, et pour TOUS les examens existants) : comme
--      aujourd'hui, rien ne change.
--   'together' : « Open » ouvre la salle d'attente ; le prof clique « Start »
--      pour chaque épreuve. Avant ce clic, le contenu de l'épreuve est
--      ILLISIBLE (même règle que pour une épreuve verrouillée).
--      Modifiable seulement tant que l'examen n'est pas en cours (comme les
--      autres réglages).
--
-- RÈGLES (décidées avec Mamadou le 03/10)
--   1. Même départ, même fin : l'heure de départ d'un candidat est l'heure
--      où le prof a lancé l'épreuve. Un retardataire a donc le temps RESTANT.
--   2. Un candidat encore dans l'épreuve précédente (minutes offertes)
--      commence la suivante à sa remise, avec le temps complet.
--   3. Épreuve suivante : le prof ne peut la lancer que quand le temps de la
--      précédente est fini, ou quand tous les candidats l'ont rendue.
--   4. Un candidat qui n'a jamais commencé une épreuve dont le temps est
--      fini l'a « manquée » : la suivante s'ouvre pour lui.
--   5. « Let candidates continue on their own » (free_from) : une fois la
--      1re épreuve lancée, le prof peut laisser chacun passer à la suivante
--      quand il veut, avec son temps complet. Définitif pour cet examen.
--   6. Minutes offertes : nouvelle fonction exam_give_extra_time (staff
--      seulement, 1 à 60 min, une copie commencée, pas rendue, dans son
--      temps). Elle recule l'heure de départ de la copie : TOUTES les règles
--      de temps existantes (remise, brouillons, ramassage +5 min, chrono)
--      suivent d'elles-mêmes. Chaque don est noté (exam_extra_time).
--      « Close the exam » ferme TOUT, comme avant, minutes offertes comprises.
--
-- SÉCURITÉ : uniquement des règles RESSERRÉES. Les nouvelles colonnes ne
-- s'écrivent que par les fonctions (sauf le réglage start_mode, comme les 4
-- autres réglages). exam_extra_time : RLS activée, lecture par le staff de
-- l'examen seulement, aucune écriture directe. Jamais anon.
-- En mode 'individual', toutes les fonctions donnent EXACTEMENT les mêmes
-- résultats qu'avant (vérifié par les tests).
--
-- Script complet et ré-exécutable. Attendu : 10 lignes « OK »
-- (en local, la ligne « anon » peut dire PROBLEME : c'est normal hors Supabase).
-- À exécuter hors d'un examen en cours, AVANT de coller les fichiers du site.
-- Retour arrière : bloc tout en bas.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Les colonnes.
-- ---------------------------------------------------------------------
alter table public.exam_sessions add column if not exists start_mode text not null default 'individual';
alter table public.exam_sessions drop constraint if exists exam_sessions_start_mode_check;
alter table public.exam_sessions add constraint exam_sessions_start_mode_check
  check (start_mode in ('individual', 'together'));
alter table public.exam_sessions add column if not exists free_from timestamptz;
alter table public.exam_session_items add column if not exists room_started_at timestamptz;

-- Le réglage se modifie comme les 4 autres (et se verrouille comme eux).
-- free_from et room_started_at : AUCUN droit d'écriture (fonctions seulement).
grant update (start_mode) on public.exam_sessions to authenticated;

create or replace function public.exam_settings_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user = 'authenticated'
     and (new.strict_mode     is distinct from old.strict_mode
       or new.listening_start is distinct from old.listening_start
       or new.start_mode      is distinct from old.start_mode
       or new.opens_at        is distinct from old.opens_at
       or new.closes_at       is distinct from old.closes_at)
     -- l'examen est en cours (même règle que exam_is_open, sur l'ancienne ligne)
     and old.closed_at is null
     and (old.closes_at is null or now() < old.closes_at)
     and (old.opened_at is not null or (old.opens_at is not null and now() >= old.opens_at))
  then
    raise exception 'The exam is running: its settings are locked';
  end if;
  return new;
end $$;
revoke all on function public.exam_settings_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Le journal des minutes offertes.
-- ---------------------------------------------------------------------
create table if not exists public.exam_extra_time (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.exam_sessions(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  minutes       integer not null check (minutes between 1 and 60),
  given_by      uuid,
  given_at      timestamptz not null default now()
);
create index if not exists exam_extra_time_session_idx on public.exam_extra_time(session_id);
alter table public.exam_extra_time enable row level security;
revoke all on public.exam_extra_time from public, anon, authenticated;
grant select on public.exam_extra_time to authenticated;
drop policy if exists "exam staff read extra time" on public.exam_extra_time;
create policy "exam staff read extra time" on public.exam_extra_time
  for select using (public.is_exam_staff(session_id));

-- ---------------------------------------------------------------------
-- 3. Aides (internes : appelées seulement par les fonctions de la base).
-- ---------------------------------------------------------------------

-- L'épreuve peut-elle commencer ? (mode individual : toujours ; together :
-- lancée par le prof, ou « continue on their own » ; Speaking : toujours.)
create or replace function public.exam_item_released(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
             when e.start_mode <> 'together' then true
             when a.type = 'Speaking' then true
             else (i.room_started_at is not null or e.free_from is not null)
           end
    from exam_session_items i
    join exam_sessions e on e.id = i.session_id
    join assignments a on a.id = i.assignment_id
    where i.assignment_id = p_assignment_id
  ), true);
$$;

-- L'épreuve compte comme « faite » pour ce candidat : rendue, ou manquée
-- (mode together : lancée, temps fini, jamais commencée par lui).
create or replace function public.exam_paper_done(p_assignment_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from exam_attempts t
                 where t.assignment_id = p_assignment_id and t.student_id = p_student_id
                   and t.submitted_at is not null)
      or exists (select 1
                 from exam_session_items i
                 join exam_sessions e on e.id = i.session_id
                 join assignments a on a.id = i.assignment_id
                 where i.assignment_id = p_assignment_id
                   and e.start_mode = 'together'
                   and i.room_started_at is not null
                   and a.time_limit_minutes is not null
                   and now() >= i.room_started_at + make_interval(mins => a.time_limit_minutes)
                   and not exists (select 1 from exam_attempts t
                                   where t.assignment_id = p_assignment_id and t.student_id = p_student_id));
$$;

-- L'heure de départ donnée à ce candidat s'il commence maintenant.
-- Mode individual, classe ordinaire, épreuve « libre » : maintenant.
-- Mode together, épreuve lancée : l'heure du lancement, ou sa remise de
-- l'épreuve précédente si elle est plus tardive (règle 2).
create or replace function public.exam_paper_start_time(p_assignment_id uuid, p_student_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select greatest(i.room_started_at,
                    coalesce((select max(t.submitted_at)
                              from exam_session_items prev
                              join assignments pa on pa.id = prev.assignment_id
                              join exam_attempts t on t.assignment_id = prev.assignment_id and t.student_id = p_student_id
                              where prev.session_id = i.session_id
                                and prev.order_index < i.order_index
                                and pa.type <> 'Speaking'), i.room_started_at))
    from exam_session_items i
    join exam_sessions e on e.id = i.session_id
    where i.assignment_id = p_assignment_id
      and e.start_mode = 'together'
      and i.room_started_at is not null
  ), now());
$$;

revoke all on function public.exam_item_released(uuid) from public, anon, authenticated;
revoke all on function public.exam_paper_done(uuid, uuid) from public, anon, authenticated;
revoke all on function public.exam_paper_start_time(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Lisible / commençable (mêmes règles qu'avant + les 2 nouvelles).
--    « rendue » devient « faite » (rendue ou manquée) — identique en mode
--    individual ; et une épreuve non lancée (together) est illisible.
-- ---------------------------------------------------------------------
create or replace function public.exam_item_readable(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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
          and public.exam_item_released(i.assignment_id)
          and not exists (
            select 1 from exam_session_items prev
            join assignments pa on pa.id = prev.assignment_id
            where prev.session_id = i.session_id
              and prev.order_index < i.order_index
              and pa.type <> 'Speaking'
              and not public.exam_paper_done(prev.assignment_id, auth.uid())
          )
          and not public.exam_paper_done(i.assignment_id, auth.uid())
        )
      )
  );
$$;

create or replace function public.exam_item_startable(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from exam_session_items i
    join exam_sessions e on e.id = i.session_id
    join roster r on r.class_id = e.container_class_id and r.student_id = auth.uid()
    where i.assignment_id = p_assignment_id
      and e.results_released_at is null
      and public.exam_is_open(e.id)
      and public.exam_item_released(i.assignment_id)
      and not exists (
        select 1 from exam_session_items prev
        join assignments pa on pa.id = prev.assignment_id
        where prev.session_id = i.session_id
          and prev.order_index < i.order_index
          and pa.type <> 'Speaking'
          and not public.exam_paper_done(prev.assignment_id, auth.uid())
      )
      and not public.exam_paper_done(i.assignment_id, auth.uid())
  );
$$;

-- ---------------------------------------------------------------------
-- 5. Le chrono : l'heure de départ vient de exam_paper_start_time.
--    (Identique au script 38, sauf la ligne marquée NOUVEAU (46).)
-- ---------------------------------------------------------------------
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

  -- (38) dans un paper d'EXAMEN, un appel sans numéro d'écran est refusé.
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
    -- NOUVEAU (46) : en mode « together », l'heure de départ commune.
    insert into exam_attempts (assignment_id, student_id, started_at)
    values (p_assignment_id, v_student_id, public.exam_paper_start_time(p_assignment_id, v_student_id))
    on conflict (assignment_id, student_id) do nothing;
  end if;

  select started_at, submitted_at into v_started, v_submitted
  from exam_attempts
  where assignment_id = p_assignment_id and student_id = v_student_id;

  -- Livraison 47 : dans quel écran ce paper est-il ouvert ?
  if p_page is not null
     and v_started is not null
     and v_submitted is null
     and (v_limit is null or now() < v_started + make_interval(mins => v_limit))
  then
    select e.id, e.strict_mode, public.exam_is_open(e.id), e.results_released_at
      into v_session, v_strict, v_open, v_released
    from exam_session_items i
    join exam_sessions e on e.id = i.session_id
    where i.assignment_id = p_assignment_id;

    if v_session is not null and coalesce(v_open, false) and v_released is null then
      insert into exam_attempt_pages (assignment_id, student_id, page_token)
      values (p_assignment_id, v_student_id, p_page)
      on conflict (assignment_id, student_id) do nothing;

      if not found then
        select page_token into v_prev
        from exam_attempt_pages
        where assignment_id = p_assignment_id and student_id = v_student_id
        for update;

        if v_prev is distinct from p_page then
          update exam_attempt_pages
             set page_token = p_page, updated_at = now()
           where assignment_id = p_assignment_id and student_id = v_student_id;

          select exists (select 1 from exam_incidents x
                         where x.session_id = v_session and x.student_id = v_student_id
                           and x.freezes and x.cleared_at is null)
            into v_already;

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

-- ---------------------------------------------------------------------
-- 6. Le son du Listening : il pouvait créer la copie SANS vérifier que
--    l'épreuve pouvait commencer. Maintenant, dans un examen, la copie
--    n'est créée que si elle le peut, avec la même heure de départ que le
--    chrono. (Dans le site, le chrono crée toujours la copie avant : rien
--    ne change pour lui. Les classes ordinaires ne changent pas.)
-- ---------------------------------------------------------------------
create or replace function public.listening_audio_status(p_assignment_id uuid, p_start boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_class_id   uuid;
  v_audio      text;
  v_exam_mode  boolean;
  v_check_min  integer;
  v_started    timestamptz;
  v_is_exam    boolean;
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

  if not exists (select 1 from roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  if p_start and v_audio is not null then
    -- NOUVEAU (46) : dans un examen, pas de copie créée hors des règles.
    if not exists (select 1 from exam_attempts t where t.assignment_id = p_assignment_id and t.student_id = v_student_id) then
      select (c.kind = 'exam') into v_is_exam from classes c where c.id = v_class_id;
      if coalesce(v_is_exam, false) and not public.exam_item_startable(p_assignment_id) then
        raise exception 'This part is not open';
      end if;
    end if;

    insert into exam_attempts (assignment_id, student_id, started_at)
    values (p_assignment_id, v_student_id, public.exam_paper_start_time(p_assignment_id, v_student_id))
    on conflict (assignment_id, student_id) do nothing;

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
$$;

-- ---------------------------------------------------------------------
-- 7. Les boutons du prof : 2 nouvelles actions, les autres inchangées.
--    'start_item' (p_item_id) : lancer une épreuve pour tous (together) ;
--    'free' : laisser chacun continuer seul (définitif).
-- ---------------------------------------------------------------------
create or replace function public.exam_session_action(p_session_id uuid, p_action text, p_item_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now(); v_collected integer := 0; v_left integer := 0;
  v_e record; v_it record; v_prev record;
begin
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;

  if p_action = 'open' then
    update exam_sessions set opened_at = coalesce(opened_at, v_now), closed_at = null where id = p_session_id;
  elsif p_action = 'close' then
    update exam_sessions set closed_at = v_now where id = p_session_id;
    v_collected := public.exam_collect_papers(p_session_id, true);
    v_left := public.exam_uncollected_papers(p_session_id);
  elsif p_action = 'release' then
    update exam_sessions set results_released_at = coalesce(results_released_at, v_now) where id = p_session_id;
    update assignments set auto_release_score = true
     where id in (select assignment_id from exam_session_items where session_id = p_session_id);
    v_collected := public.exam_collect_papers(p_session_id, true);
    v_left := public.exam_uncollected_papers(p_session_id);
  elsif p_action = 'start_audio' then
    if p_item_id is null then raise exception 'Which part?'; end if;
    update exam_session_items set audio_started_at = coalesce(audio_started_at, v_now)
     where id = p_item_id and session_id = p_session_id;

  -- NOUVEAU (46) ------------------------------------------------------
  elsif p_action = 'start_item' then
    if p_item_id is null then raise exception 'Which paper?'; end if;
    select * into v_e from exam_sessions where id = p_session_id for update;
    if v_e.start_mode <> 'together' then raise exception 'This exam starts each candidate when ready'; end if;
    if v_e.results_released_at is not null or not public.exam_is_open(p_session_id) then raise exception 'The exam is not open'; end if;
    if v_e.free_from is not null then raise exception 'Candidates already continue on their own'; end if;
    select i.*, a.type, a.time_limit_minutes into v_it
      from exam_session_items i join assignments a on a.id = i.assignment_id
     where i.id = p_item_id and i.session_id = p_session_id for update of i;
    if not found then raise exception 'Which paper?'; end if;
    if v_it.type = 'Speaking' then raise exception 'A Speaking paper does not need to be started'; end if;
    if v_it.room_started_at is null then
      -- Every earlier paper must be started, and over: its time is up, or
      -- every candidate has handed it in.
      for v_prev in
        select i.*, a.time_limit_minutes
        from exam_session_items i join assignments a on a.id = i.assignment_id
        where i.session_id = p_session_id and i.order_index < v_it.order_index and a.type <> 'Speaking'
      loop
        if v_prev.room_started_at is null then raise exception 'Start the previous paper first'; end if;
        if not (
             (v_prev.time_limit_minutes is not null
              and v_now >= v_prev.room_started_at + make_interval(mins => v_prev.time_limit_minutes))
          or not exists (select 1 from roster r
                         where r.class_id = v_e.container_class_id
                           and not exists (select 1 from exam_attempts t
                                           where t.assignment_id = v_prev.assignment_id
                                             and t.student_id = r.student_id and t.submitted_at is not null))
        ) then
          raise exception 'Wait until the previous paper is over';
        end if;
      end loop;
      update exam_session_items set room_started_at = v_now where id = p_item_id;
      -- Listening heard by the whole room: the recording starts with the paper.
      if v_e.listening_start = 'grouped' and v_it.type = 'Listening' then
        update exam_session_items set audio_started_at = coalesce(audio_started_at, v_now) where id = p_item_id;
      end if;
    end if;
  elsif p_action = 'free' then
    select * into v_e from exam_sessions where id = p_session_id for update;
    if v_e.start_mode <> 'together' then raise exception 'This exam starts each candidate when ready'; end if;
    if v_e.results_released_at is not null or not public.exam_is_open(p_session_id) then raise exception 'The exam is not open'; end if;
    if not exists (select 1 from exam_session_items i where i.session_id = p_session_id and i.room_started_at is not null) then
      raise exception 'Start the first paper first';
    end if;
    update exam_sessions set free_from = coalesce(free_from, v_now) where id = p_session_id;
  -- -------------------------------------------------------------------
  else
    raise exception 'Unknown action';
  end if;

  return jsonb_build_object('ok', true, 'at', v_now, 'collected', v_collected, 'uncollected', v_left);
end $$;

-- ---------------------------------------------------------------------
-- 8. Offrir des minutes à un candidat (staff de l'examen).
-- ---------------------------------------------------------------------
create or replace function public.exam_give_extra_time(p_session_id uuid, p_student_id uuid, p_assignment_id uuid, p_minutes integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_limit integer; v_started timestamptz; v_submitted timestamptz;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 60 then raise exception 'Choose between 1 and 60 minutes'; end if;
  if not exists (select 1 from exam_session_items i where i.session_id = p_session_id and i.assignment_id = p_assignment_id) then
    raise exception 'This paper is not in this exam';
  end if;
  if not public.exam_is_open(p_session_id)
     or exists (select 1 from exam_sessions e where e.id = p_session_id and e.results_released_at is not null) then
    raise exception 'The exam is not open';
  end if;

  select a.time_limit_minutes into v_limit from assignments a where a.id = p_assignment_id;
  if v_limit is null then raise exception 'This paper has no time limit'; end if;

  select started_at, submitted_at into v_started, v_submitted
    from exam_attempts where assignment_id = p_assignment_id and student_id = p_student_id for update;
  if v_started is null then raise exception 'This candidate has not started this paper'; end if;
  if v_submitted is not null then raise exception 'This paper is already handed in'; end if;
  if now() >= v_started + make_interval(mins => v_limit) then raise exception 'The time is already over for this paper'; end if;

  update exam_attempts set started_at = started_at + make_interval(mins => p_minutes)
   where assignment_id = p_assignment_id and student_id = p_student_id;
  insert into exam_extra_time (session_id, assignment_id, student_id, minutes, given_by)
  values (p_session_id, p_assignment_id, p_student_id, p_minutes, auth.uid());

  return jsonb_build_object('ends_at', v_started + make_interval(mins => v_limit + p_minutes));
end $$;
revoke all on function public.exam_give_extra_time(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.exam_give_extra_time(uuid, uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Ce que voit la page de l'examen (candidat et staff) : les mêmes
--    clés qu'avant, plus le mode, la salle et, pour le candidat, ses heures.
-- ---------------------------------------------------------------------
create or replace function public.exam_session_status(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    -- NOUVEAU (46)
    'start_mode', v_e.start_mode,
    'free_from', v_e.free_from,
    'candidates', (select count(*) from roster r where r.class_id = v_e.container_class_id),
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
        'readable', public.exam_item_readable(i.assignment_id),
        -- NOUVEAU (46)
        'room_started_at', i.room_started_at,
        'released', public.exam_item_released(i.assignment_id),
        'my_started_at', (select at.started_at from exam_attempts at
                          where at.assignment_id = i.assignment_id and at.student_id = auth.uid()),
        'start_if_now', case when v_e.start_mode = 'together' and i.room_started_at is not null
                             then public.exam_paper_start_time(i.assignment_id, auth.uid()) end,
        'missed', (public.exam_paper_done(i.assignment_id, auth.uid())
                   and not exists (select 1 from exam_attempts at
                                   where at.assignment_id = i.assignment_id and at.student_id = auth.uid())),
        'extra_minutes', (select coalesce(sum(x.minutes), 0) from exam_extra_time x
                          where x.assignment_id = i.assignment_id and x.student_id = auth.uid())
      ) order by i.order_index)
      from exam_session_items i join assignments a on a.id = i.assignment_id
      where i.session_id = p_session_id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;

-- ---------------------------------------------------------------------
-- 10. Dupliquer un examen copie aussi ce réglage (une ligne change).
-- ---------------------------------------------------------------------
create or replace function public.duplicate_exam_session(p_session_id uuid, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  -- NOUVEAU (46) : start_mode copié aussi.
  insert into exam_sessions (name, code, container_class_id, created_by, strict_mode, listening_start, start_mode)
  values (v_name, v_code, v_class, auth.uid(), v_src.strict_mode, v_src.listening_start, v_src.start_mode)
  returning id into v_session;

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
end $$;

-- Droits (inchangés pour les fonctions qui existaient : connectés seulement).
revoke all on function public.exam_item_readable(uuid) from public, anon;
revoke all on function public.exam_item_startable(uuid) from public, anon;
revoke all on function public.exam_timer_status(uuid, boolean, uuid) from public, anon;
revoke all on function public.listening_audio_status(uuid, boolean) from public, anon;
revoke all on function public.exam_session_action(uuid, text, uuid) from public, anon;
revoke all on function public.exam_session_status(uuid) from public, anon;
revoke all on function public.duplicate_exam_session(uuid, text) from public, anon;
grant execute on function public.exam_item_readable(uuid) to authenticated;
grant execute on function public.exam_item_startable(uuid) to authenticated;
grant execute on function public.exam_timer_status(uuid, boolean, uuid) to authenticated;
grant execute on function public.listening_audio_status(uuid, boolean) to authenticated;
grant execute on function public.exam_session_action(uuid, text, uuid) to authenticated;
grant execute on function public.exam_session_status(uuid) to authenticated;
grant execute on function public.duplicate_exam_session(uuid, text) to authenticated;

commit;

-- ---------------------------------------------------------------------
-- Contrôles
-- ---------------------------------------------------------------------
select '1. réglage start_mode : défaut « individual », valeurs contrôlées' as controle,
       case when (select column_default from information_schema.columns where table_schema='public' and table_name='exam_sessions' and column_name='start_mode') like '%individual%'
             and exists (select 1 from pg_constraint where conname='exam_sessions_start_mode_check')
            then 'OK' else 'PROBLEME' end as resultat
union all
select '2. colonnes free_from (examen) et room_started_at (épreuve) présentes',
       case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='exam_sessions' and column_name='free_from')
             and exists (select 1 from information_schema.columns where table_schema='public' and table_name='exam_session_items' and column_name='room_started_at')
            then 'OK' else 'PROBLEME' end
union all
select '3. free_from et room_started_at : aucun droit d''écriture directe',
       case when not has_column_privilege('authenticated', 'public.exam_sessions', 'free_from', 'update')
             and not has_column_privilege('authenticated', 'public.exam_session_items', 'room_started_at', 'update')
             and not has_column_privilege('authenticated', 'public.exam_session_items', 'room_started_at', 'insert')
            then 'OK' else 'PROBLEME' end
union all
select '4. start_mode : modifiable comme les autres réglages, verrouillé pendant l''examen',
       case when has_column_privilege('authenticated', 'public.exam_sessions', 'start_mode', 'update')
             and position('start_mode' in pg_get_functiondef('public.exam_settings_guard()'::regprocedure)) > 0
            then 'OK' else 'PROBLEME' end
union all
select '5. exam_extra_time : RLS activée, lecture par le staff seulement, aucune écriture',
       case when (select relrowsecurity from pg_class where oid='public.exam_extra_time'::regclass)
             and not has_table_privilege('authenticated', 'public.exam_extra_time', 'insert')
             and not has_table_privilege('authenticated', 'public.exam_extra_time', 'update')
             and not has_table_privilege('authenticated', 'public.exam_extra_time', 'delete')
             and (select count(*) from pg_policies where schemaname='public' and tablename='exam_extra_time') = 1
            then 'OK' else 'PROBLEME' end
union all
select '6. les 3 aides : appelées seulement par la base (personne ne peut les appeler)',
       case when not has_function_privilege('authenticated', 'public.exam_item_released(uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public.exam_paper_done(uuid,uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public.exam_paper_start_time(uuid,uuid)', 'execute')
            then 'OK' else 'PROBLEME' end
union all
select '7. fonctions du site : connectés seulement, jamais anon',
       case when has_function_privilege('authenticated', 'public.exam_give_extra_time(uuid,uuid,uuid,integer)', 'execute')
             and not has_function_privilege('anon', 'public.exam_give_extra_time(uuid,uuid,uuid,integer)', 'execute')
             and not has_function_privilege('anon', 'public.exam_session_action(uuid,text,uuid)', 'execute')
             and not has_function_privilege('anon', 'public.exam_timer_status(uuid,boolean,uuid)', 'execute')
             and not has_function_privilege('anon', 'public.listening_audio_status(uuid,boolean)', 'execute')
             and not has_function_privilege('anon', 'public.exam_session_status(uuid)', 'execute')
            then 'OK' else 'PROBLEME' end
union all
select '8. toutes en « security definer » avec search_path = public',
       case when not exists (select 1 from pg_proc p where p.pronamespace='public'::regnamespace
                              and p.proname in ('exam_item_released','exam_paper_done','exam_paper_start_time','exam_item_readable','exam_item_startable',
                                                'exam_timer_status','listening_audio_status','exam_session_action','exam_give_extra_time',
                                                'exam_session_status','duplicate_exam_session')
                              and not (p.prosecdef and p.proconfig @> array['search_path=public']))
            then 'OK' else 'PROBLEME' end
union all
select '9. le chrono garde la règle 38 (appel sans numéro refusé) et prend l''heure commune',
       case when position('Please reload the page' in pg_get_functiondef('public.exam_timer_status(uuid,boolean,uuid)'::regprocedure)) > 0
             and position('exam_paper_start_time' in pg_get_functiondef('public.exam_timer_status(uuid,boolean,uuid)'::regprocedure)) > 0
            then 'OK' else 'PROBLEME' end
union all
select '10. anon n''a toujours aucun droit sur les tables de public',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLEME' end;

/* =====================================================================
   RETOUR ARRIÈRE — remet EXACTEMENT les fonctions d'avant (copie des
   versions en ligne le 03/10/2026), retire le journal et les colonnes.
   À exécuter hors d'un examen en cours. Les examens passés en
   « together » redeviennent « individual » (la colonne disparaît).

begin;

drop function if exists public.exam_give_extra_time(uuid, uuid, uuid, integer);
drop table if exists public.exam_extra_time;

CREATE OR REPLACE FUNCTION public.exam_settings_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user = 'authenticated'
     and (new.strict_mode     is distinct from old.strict_mode
       or new.listening_start is distinct from old.listening_start
       or new.opens_at        is distinct from old.opens_at
       or new.closes_at       is distinct from old.closes_at)
     -- l'examen est en cours (même règle que exam_is_open, sur l'ancienne ligne)
     and old.closed_at is null
     and (old.closes_at is null or now() < old.closes_at)
     and (old.opened_at is not null or (old.opens_at is not null and now() >= old.opens_at))
  then
    raise exception 'The exam is running: its settings are locked';
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.exam_item_readable(p_assignment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.exam_item_startable(p_assignment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.exam_timer_status(p_assignment_id uuid, p_start boolean, p_page uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.listening_audio_status(p_assignment_id uuid, p_start boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.exam_session_action(p_session_id uuid, p_action text, p_item_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.exam_session_status(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.duplicate_exam_session(p_session_id uuid, p_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

drop function if exists public.exam_paper_start_time(uuid, uuid);
drop function if exists public.exam_paper_done(uuid, uuid);
drop function if exists public.exam_item_released(uuid);

revoke update (start_mode) on public.exam_sessions from authenticated;
alter table public.exam_session_items drop column if exists room_started_at;
alter table public.exam_sessions drop column if exists free_from;
alter table public.exam_sessions drop constraint if exists exam_sessions_start_mode_check;
alter table public.exam_sessions drop column if exists start_mode;

commit;

   ===================================================================== */
