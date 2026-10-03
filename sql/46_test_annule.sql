-- =====================================================================
-- 46_test_annule.sql — livraison 79 — À COLLER AVANT le script 46.
-- Ce test fait TOUT le script 46 et 36 vérifications dans UNE transaction
-- qui est ANNULÉE à la fin : la base ne change PAS.
-- Résultat attendu : un message « ERROR: RESULTATS : 36 OK / 0 KO » suivi
-- de la liste des vérifications. (Le mot ERROR est normal : c'est
-- l'annulation volontaire.) Si une ligne commence par KO : NE PAS lancer
-- le script 46 et m'envoyer le message.
-- =====================================================================
do $X$
declare
  r text := ''; ok int := 0; ko int := 0;
  t1 uuid; s1 uuid; s2 uuid; s3 uuid;
  box uuid := '00000000-0000-4000-8000-0000000079b0'; ex uuid := '00000000-0000-4000-8000-0000000079e0';
  box0 uuid := '00000000-0000-4000-8000-0000000079b1'; ex0 uuid := '00000000-0000-4000-8000-0000000079e1';
  pL uuid := '00000000-0000-4000-8000-0000000079a1'; pR uuid := '00000000-0000-4000-8000-0000000079a2';
  pW uuid := '00000000-0000-4000-8000-0000000079a3'; pSP uuid := '00000000-0000-4000-8000-0000000079a4';
  pL0 uuid := '00000000-0000-4000-8000-0000000079a5'; pR0 uuid := '00000000-0000-4000-8000-0000000079a6';
  iL uuid := '00000000-0000-4000-8000-0000000079c1'; iR uuid := '00000000-0000-4000-8000-0000000079c2';
  iW uuid := '00000000-0000-4000-8000-0000000079c3';
  rec record; before jsonb := '{}'; after jsonb := '{}'; pairs int := 0; st_before jsonb;
  j jsonb; v timestamptz; b boolean; msg text; n int;
begin
  -- 0. Before the script: what every candidate can read / start in every
  --    exam that exists (one line per candidate × paper).
  for rec in
    select r.student_id, i.assignment_id
    from exam_session_items i join exam_sessions e on e.id = i.session_id
    join roster r on r.class_id = e.container_class_id
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', rec.student_id, 'role', 'authenticated')::text, true);
    before := before || jsonb_build_object(rec.student_id || '|' || rec.assignment_id,
                jsonb_build_array(exam_item_readable(rec.assignment_id), exam_item_startable(rec.assignment_id)));
    pairs := pairs + 1;
  end loop;
  select jsonb_agg(x order by x::text) into st_before from (
    select exam_session_status(e.id) - 'server_now' as x from exam_sessions e limit 0) q;

  -- 1. The script itself (without its begin/commit).
  execute $S$
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
$S$;

  -- 2. After: the same answers for every existing candidate × paper.
  for rec in
    select r.student_id, i.assignment_id
    from exam_session_items i join exam_sessions e on e.id = i.session_id
    join roster r on r.class_id = e.container_class_id
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', rec.student_id, 'role', 'authenticated')::text, true);
    after := after || jsonb_build_object(rec.student_id || '|' || rec.assignment_id,
                jsonb_build_array(exam_item_readable(rec.assignment_id), exam_item_startable(rec.assignment_id)));
  end loop;
  if before = after then ok := ok + 1; r := r || E'\nOK  0  examens existants : ' || pairs || ' couples candidat × épreuve, lisible/commençable IDENTIQUES avant et après';
  else ko := ko + 1; r := r || E'\nKO  0  différences : ' || before::text || ' / ' || after::text; end if;
  if not exists (select 1 from exam_sessions where start_mode <> 'individual' and id not in (
       '00000000-0000-4000-8000-0000000079e0')) then ok := ok + 1; r := r || E'\nOK  0b tous les examens existants sont en « individual »';
  else ko := ko + 1; r := r || E'\nKO  0b'; end if;

  select id into t1 from profiles where role = 'teacher' order by created_at limit 1;
  select id into s1 from profiles where id <> t1 order by created_at limit 1;
  select id into s2 from profiles where id not in (t1, s1) order by created_at limit 1;
  select id into s3 from profiles where id not in (t1, s1, s2) order by created_at limit 1;
  r := r || E'\n(prof=' || t1 || ' candidats=' || s1 || ',' || s2 || ',' || coalesce(s3::text, '-') || ')';

  -- Two exams of t1, open: ex = together, ex0 = individual (unchanged rules).
  insert into classes(id, name, teacher_id, code, kind) values (box, 'T79 box', t1, 'EX-T79A', 'exam'), (box0, 'T79 box0', t1, 'EX-T79B', 'exam');
  insert into exam_sessions(id, name, code, container_class_id, created_by, opened_at, start_mode)
    values (ex, 'T79 together', 'T79AAA', box, t1, now() - interval '1 hour', 'together'),
           (ex0, 'T79 individual', 'T79BBB', box0, t1, now() - interval '1 hour', 'individual');
  insert into exam_session_staff(session_id, teacher_id, role) values (ex, t1, 'owner'), (ex0, t1, 'owner') on conflict do nothing;
  insert into assignments(id, class_id, title, type, time_limit_minutes, listening_audio_url) values
    (pL0, box0, 'pL0', 'Listening', 30, 'https://example.org/x.mp3');
  insert into assignments(id, class_id, title, type, time_limit_minutes) values
    (pL, box, 'pL', 'Listening', 30), (pR, box, 'pR', 'Reading', 60), (pW, box, 'pW', 'Writing', 60), (pSP, box, 'S', 'Speaking', null),
    (pR0, box0, 'pR0', 'Reading', 60);
  insert into exam_session_items(id, session_id, assignment_id, order_index) values
    (iL, ex, pL, 1), (iR, ex, pR, 2), (iW, ex, pW, 3), (gen_random_uuid(), ex, pSP, 4),
    (gen_random_uuid(), ex0, pL0, 1), (gen_random_uuid(), ex0, pR0, 2);
  insert into roster(class_id, student_id) values (box, s1), (box, s2), (box0, s1);

  -- A. Individual mode: exactly as before.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  if exam_item_readable(pL0) and exam_item_startable(pL0) and not exam_item_readable(pR0) and not exam_item_startable(pR0)
  then ok := ok + 1; r := r || E'\nOK  A1 individual : pL0 lisible/commençable, pR0 verrouillé (comme avant)';
  else ko := ko + 1; r := r || E'\nKO  A1 individual'; end if;
  j := exam_timer_status(pL0, true, gen_random_uuid());
  if (j->>'started_at')::timestamptz = now() then ok := ok + 1; r := r || E'\nOK  A2 individual : départ = maintenant';
  else ko := ko + 1; r := r || E'\nKO  A2 individual : ' || j::text; end if;
  update exam_attempts set submitted_at = now() where assignment_id = pL0 and student_id = s1;
  if exam_item_startable(pR0) and not exam_item_readable(pL0) then ok := ok + 1; r := r || E'\nOK  A3 individual : pL0 rendue → pR0 s''ouvre, pL0 fermée';
  else ko := ko + 1; r := r || E'\nKO  A3 individual'; end if;

  -- B. Together: before « Start », nothing is readable.
  if not exam_item_readable(pL) and not exam_item_startable(pL) and exam_item_readable(pSP) = false
  then ok := ok + 1; r := r || E'\nOK  B1 together : avant Start, pL illisible et pas commençable';
  else ko := ko + 1; r := r || E'\nKO  B1 together avant Start'; end if;
  begin perform exam_timer_status(pL, true, gen_random_uuid()); ko := ko + 1; r := r || E'\nKO  B2 Start refusé';
  exception when others then get stacked diagnostics msg = message_text;
    if msg = 'This part is not open' then ok := ok + 1; r := r || E'\nOK  B2 together : Start du candidat refusé (This part is not open)';
    else ko := ko + 1; r := r || E'\nKO  B2 : ' || msg; end if; end;
  begin perform exam_session_action(ex, 'start_item', iL); ko := ko + 1; r := r || E'\nKO  B3 candidat lance';
  exception when others then get stacked diagnostics msg = message_text;
    if msg = 'Not allowed' then ok := ok + 1; r := r || E'\nOK  B3 un candidat ne peut pas lancer une épreuve (Not allowed)';
    else ko := ko + 1; r := r || E'\nKO  B3 : ' || msg; end if; end;

  -- C. The teacher starts the papers.
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  begin perform exam_session_action(ex, 'start_item', iR); ko := ko + 1; r := r || E'\nKO  C1 ordre';
  exception when others then get stacked diagnostics msg = message_text;
    if msg = 'Start the previous paper first' then ok := ok + 1; r := r || E'\nOK  C1 lancer Reading avant Listening : refusé';
    else ko := ko + 1; r := r || E'\nKO  C1 : ' || msg; end if; end;
  begin perform exam_session_action(ex0, 'start_item', (select id from exam_session_items where assignment_id = pL0)); ko := ko + 1; r := r || E'\nKO  C2';
  exception when others then get stacked diagnostics msg = message_text;
    if msg like 'This exam starts each candidate when ready' then ok := ok + 1; r := r || E'\nOK  C2 examen individual : « start_item » refusé';
    else ko := ko + 1; r := r || E'\nKO  C2 : ' || msg; end if; end;
  begin perform exam_session_action(ex, 'free'); ko := ko + 1; r := r || E'\nKO  C3';
  exception when others then get stacked diagnostics msg = message_text;
    if msg = 'Start the first paper first' then ok := ok + 1; r := r || E'\nOK  C3 « continue on their own » avant le 1er Start : refusé';
    else ko := ko + 1; r := r || E'\nKO  C3 : ' || msg; end if; end;
  perform exam_session_action(ex, 'start_item', iL);
  perform exam_session_action(ex, 'start_item', iL);   -- twice: harmless
  select room_started_at into v from exam_session_items where id = iL;
  if v = now() then ok := ok + 1; r := r || E'\nOK  C4 Start Listening : heure écrite par le serveur (2 clics = 1 heure)';
  else ko := ko + 1; r := r || E'\nKO  C4 ' || coalesce(v::text, 'null'); end if;
  begin perform exam_session_action(ex, 'start_item', iR); ko := ko + 1; r := r || E'\nKO  C5';
  exception when others then get stacked diagnostics msg = message_text;
    if msg = 'Wait until the previous paper is over' then ok := ok + 1; r := r || E'\nOK  C5 Reading pendant le Listening (temps pas fini, pas tous rendu) : refusé';
    else ko := ko + 1; r := r || E'\nKO  C5 : ' || msg; end if; end;

  -- D. Candidates: same start; a late one gets the time left.
  update exam_session_items set room_started_at = now() - interval '10 minutes' where id = iL;   -- 10 min ago
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  if exam_item_readable(pL) and exam_item_startable(pL) and not exam_item_readable(pR)
  then ok := ok + 1; r := r || E'\nOK  D1 après Start : pL lisible pour le candidat, pR toujours verrouillé';
  else ko := ko + 1; r := r || E'\nKO  D1'; end if;
  j := exam_timer_status(pL, true, gen_random_uuid());
  if (j->>'started_at')::timestamptz = now() - interval '10 minutes' then ok := ok + 1; r := r || E'\nOK  D2 départ du candidat = heure du Start (arrivé 10 min après : il lui reste 20 min)';
  else ko := ko + 1; r := r || E'\nKO  D2 ' || j::text; end if;

  -- E. Extra minutes.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  begin perform exam_give_extra_time(ex, s1, pL, 5); ko := ko + 1; r := r || E'\nKO  E1';
  exception when others then get stacked diagnostics msg = message_text;
    if msg = 'Not allowed' then ok := ok + 1; r := r || E'\nOK  E1 un candidat ne peut pas s''offrir des minutes';
    else ko := ko + 1; r := r || E'\nKO  E1 : ' || msg; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  begin perform exam_give_extra_time(ex, s1, pL, 0); ko := ko + 1; r := r || E'\nKO  E2';
  exception when others then get stacked diagnostics msg = message_text;
    if msg like 'Choose between 1 and 60%' then ok := ok + 1; r := r || E'\nOK  E2 0 minute : refusé';
    else ko := ko + 1; r := r || E'\nKO  E2 : ' || msg; end if; end;
  begin perform exam_give_extra_time(ex, s2, pL, 5); ko := ko + 1; r := r || E'\nKO  E3';
  exception when others then get stacked diagnostics msg = message_text;
    if msg = 'This candidate has not started this paper' then ok := ok + 1; r := r || E'\nOK  E3 candidat pas commencé : refusé';
    else ko := ko + 1; r := r || E'\nKO  E3 : ' || msg; end if; end;
  j := exam_give_extra_time(ex, s1, pL, 6);
  select started_at into v from exam_attempts where assignment_id = pL and student_id = s1;
  select count(*) into n from exam_extra_time where session_id = ex and student_id = s1 and minutes = 6;
  if v = now() - interval '4 minutes' and n = 1 and (j->>'ends_at')::timestamptz = now() + interval '26 minutes'
  then ok := ok + 1; r := r || E'\nOK  E4 +6 min : la fin recule de 6 min (20 → 26 min restantes), noté dans le journal';
  else ko := ko + 1; r := r || E'\nKO  E4 ' || coalesce(v::text,'null') || ' ' || n || ' ' || j::text; end if;

  -- F. Next paper.
  update exam_session_items set room_started_at = now() - interval '31 minutes' where id = iL;   -- Listening over for the room
  perform exam_session_action(ex, 'start_item', iR);
  update exam_session_items set room_started_at = now() - interval '5 minutes' where id = iR;
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  if not exam_item_startable(pL) and exam_item_startable(pR) and exam_item_readable(pR)
  then ok := ok + 1; r := r || E'\nOK  F1 candidat qui n''a jamais commencé pL (temps fini) : pL « manquée », pR s''ouvre pour lui';
  else ko := ko + 1; r := r || E'\nKO  F1'; end if;
  j := exam_session_status(ex);
  if (j->'items'->0->>'missed')::boolean and j->>'start_mode' = 'together' and (j->>'candidates')::int = 2
  then ok := ok + 1; r := r || E'\nOK  F2 statut : start_mode, candidats, « missed » pour pL';
  else ko := ko + 1; r := r || E'\nKO  F2 ' || j::text; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  if not exam_item_startable(pR) then ok := ok + 1; r := r || E'\nOK  F3 candidat encore dans pL (minutes offertes) : pR pas encore';
  else ko := ko + 1; r := r || E'\nKO  F3'; end if;
  update exam_attempts set submitted_at = now() - interval '2 minutes' where assignment_id = pL and student_id = s1;   -- hands pL in 2 min ago
  j := exam_timer_status(pR, true, gen_random_uuid());
  if (j->>'started_at')::timestamptz = now() - interval '2 minutes'
  then ok := ok + 1; r := r || E'\nOK  F4 il commence pR à sa remise de pL (pas au Start de pR) : temps complet';
  else ko := ko + 1; r := r || E'\nKO  F4 ' || j::text; end if;
  j := exam_session_status(ex);
  if (j->'items'->0->>'extra_minutes')::int = 6 and (j->'items'->1->>'my_started_at') is not null
  then ok := ok + 1; r := r || E'\nOK  F5 statut du candidat : ses minutes offertes, son heure de départ';
  else ko := ko + 1; r := r || E'\nKO  F5 ' || j::text; end if;

  -- G. « Continue on their own ».
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  perform exam_session_action(ex, 'free');
  begin perform exam_session_action(ex, 'start_item', iW); ko := ko + 1; r := r || E'\nKO  G1';
  exception when others then get stacked diagnostics msg = message_text;
    if msg = 'Candidates already continue on their own' then ok := ok + 1; r := r || E'\nOK  G1 après « continue on their own » : plus de Start';
    else ko := ko + 1; r := r || E'\nKO  G1 : ' || msg; end if; end;
  update exam_attempts set submitted_at = now() where assignment_id = pR and student_id = s1;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  j := exam_timer_status(pW, true, gen_random_uuid());
  if (j->>'started_at')::timestamptz = now() then ok := ok + 1; r := r || E'\nOK  G2 Writing jamais lancé : chacun le commence quand il veut, temps complet';
  else ko := ko + 1; r := r || E'\nKO  G2 ' || j::text; end if;

  -- H. Settings, columns, Speaking, duplicate.
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin update exam_sessions set start_mode = 'individual' where id = ex; ko := ko + 1; r := r || E'\nKO  H1';
  exception when others then get stacked diagnostics msg = message_text;
    if msg = 'The exam is running: its settings are locked' then ok := ok + 1; r := r || E'\nOK  H1 changer le mode pendant l''examen : refusé';
    else ko := ko + 1; r := r || E'\nKO  H1 : ' || msg; end if; end;
  begin update exam_sessions set free_from = null where id = ex; ko := ko + 1; r := r || E'\nKO  H2';
  exception when others then get stacked diagnostics msg = message_text;
    if msg like 'permission denied%' then ok := ok + 1; r := r || E'\nOK  H2 écrire free_from directement : interdit';
    else ko := ko + 1; r := r || E'\nKO  H2 : ' || msg; end if; end;
  begin update exam_session_items set room_started_at = null where id = iL; ko := ko + 1; r := r || E'\nKO  H3';
  exception when others then get stacked diagnostics msg = message_text;
    if msg like 'permission denied%' then ok := ok + 1; r := r || E'\nOK  H3 écrire room_started_at directement : interdit';
    else ko := ko + 1; r := r || E'\nKO  H3 : ' || msg; end if; end;
  begin insert into exam_extra_time(session_id, assignment_id, student_id, minutes) values (ex, pL, s1, 30); ko := ko + 1; r := r || E'\nKO  H4';
  exception when others then get stacked diagnostics msg = message_text;
    if msg like 'permission denied%' then ok := ok + 1; r := r || E'\nOK  H4 écrire dans le journal des minutes directement : interdit';
    else ko := ko + 1; r := r || E'\nKO  H4 : ' || msg; end if; end;
  select count(*) into n from exam_extra_time where session_id = ex;
  if n = 1 then ok := ok + 1; r := r || E'\nOK  H5 le prof de l''examen lit le journal (1 ligne)';
  else ko := ko + 1; r := r || E'\nKO  H5 ' || n; end if;
  update exam_sessions set strict_mode = strict_mode where id = ex0;   -- unchanged column: allowed
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from exam_extra_time;
  execute 'reset role';
  if n = 0 then ok := ok + 1; r := r || E'\nOK  H6 un candidat ne lit pas le journal des minutes';
  else ko := ko + 1; r := r || E'\nKO  H6 ' || n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  if exam_item_released(pSP) then ok := ok + 1; r := r || E'\nOK  H7 Speaking (non chronométré) : pas besoin de Start';
  else ko := ko + 1; r := r || E'\nKO  H7'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  j := duplicate_exam_session(ex, 'T79 copy');
  if (select start_mode from exam_sessions where id = (j->>'session_id')::uuid) = 'together'
     and (select free_from from exam_sessions where id = (j->>'session_id')::uuid) is null
     and not exists (select 1 from exam_session_items where session_id = (j->>'session_id')::uuid and room_started_at is not null)
  then ok := ok + 1; r := r || E'\nOK  H8 dupliquer : le mode est copié, rien n''est « lancé » dans la copie';
  else ko := ko + 1; r := r || E'\nKO  H8'; end if;

  -- I. Listening sound: no copy outside the rules.
  insert into assignments(id, class_id, title, type, time_limit_minutes, listening_audio_url) values ('00000000-0000-4000-8000-0000000079a7', box, 'L2', 'Listening', 30, 'https://example.org/y.mp3');
  insert into exam_session_items(session_id, assignment_id, order_index) values (ex, '00000000-0000-4000-8000-0000000079a7', 9);
  update exam_sessions set free_from = null where id = ex;
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  begin perform listening_audio_status('00000000-0000-4000-8000-0000000079a7', true); ko := ko + 1; r := r || E'\nKO  I1';
  exception when others then get stacked diagnostics msg = message_text;
    if msg = 'This part is not open' then ok := ok + 1; r := r || E'\nOK  I1 son d''un Listening pas lancé : aucune copie créée';
    else ko := ko + 1; r := r || E'\nKO  I1 : ' || msg; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  j := listening_audio_status(pL0, true);   -- individual exam, copy exists: as before
  if j->>'audio_started_at' is not null then ok := ok + 1; r := r || E'\nOK  I2 examen individual : le son démarre comme avant';
  else ko := ko + 1; r := r || E'\nKO  I2 ' || j::text; end if;

  raise exception 'RESULTATS : % OK / % KO%', ok, ko, r;
end $X$;
