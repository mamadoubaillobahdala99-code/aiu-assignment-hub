-- =====================================================================
--  AIU Assignment Hub — les sessions d'examen (etape 1, socle)
--
--  Une session d'examen enchaine plusieurs epreuves (Listening, puis
--  Reading, puis Writing) en une seule fois, avec son propre code.
--
--  Principe de securite : le verrouillage n'est PAS un affichage.
--  Tant que l'epreuve precedente n'est pas rendue, le passage et les
--  questions de la suivante sont ILLISIBLES par l'API. Et une epreuve
--  deja rendue redevient illisible — comme une copie qu'on ramasse.
--
--  Le contenant : chaque session possede une "classe" privee qui
--  n'apparait jamais dans My classes et qu'aucun code de classe ne
--  permet de rejoindre. Les tests d'examen lui appartiennent, donc ils
--  ne peuvent pas fuiter dans une vraie classe. C'est ce qui permet de
--  reutiliser tel quel tout le socle de securite deja verifie.
--
--  RELANCABLE. Ne supprime aucune donnee.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Les classes ont desormais une nature.
--    'class' = une vraie classe.  'exam' = le contenant prive d'une
--    session, invisible partout ailleurs.
-- ---------------------------------------------------------------------

alter table public.classes add column if not exists kind text not null default 'class';
do $$ begin
  alter table public.classes add constraint classes_kind_check check (kind in ('class','exam'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Les tables
-- ---------------------------------------------------------------------

create table if not exists public.exam_sessions (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  code                text not null unique,
  container_class_id  uuid not null references public.classes(id) on delete cascade,
  created_by          uuid not null references public.profiles(id),
  opens_at            timestamptz,
  closes_at           timestamptz,
  opened_at           timestamptz,   -- le prof a clique "Ouvrir maintenant"
  closed_at           timestamptz,   -- le prof a clique "Fermer"
  strict_mode         boolean not null default true,
  listening_start     text not null default 'individual',
  results_released_at timestamptz,
  created_at          timestamptz not null default now()
);
do $$ begin
  alter table public.exam_sessions add constraint exam_sessions_listening_start_check
    check (listening_start in ('individual','grouped'));
exception when duplicate_object then null; end $$;

-- Le createur et les profs invites.
create table if not exists public.exam_session_staff (
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'co',
  added_at   timestamptz not null default now(),
  primary key (session_id, teacher_id)
);

-- Les epreuves, dans l'ordre.
create table if not exists public.exam_session_items (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.exam_sessions(id) on delete cascade,
  assignment_id    uuid not null unique references public.assignments(id) on delete cascade,
  order_index      integer not null default 0,
  audio_started_at timestamptz,   -- depart groupe du Listening
  created_at       timestamptz not null default now()
);

create index if not exists idx_exam_sessions_container on public.exam_sessions(container_class_id);
create index if not exists idx_exam_items_session      on public.exam_session_items(session_id, order_index);
create index if not exists idx_exam_items_assignment   on public.exam_session_items(assignment_id);
create index if not exists idx_exam_staff_teacher      on public.exam_session_staff(teacher_id);

alter table public.exam_sessions      enable row level security;
alter table public.exam_session_staff enable row level security;
alter table public.exam_session_items enable row level security;

-- ---------------------------------------------------------------------
-- 3. Les fonctions d'aide
-- ---------------------------------------------------------------------

-- Suis-je prof (createur ou invite) de cette session ?
create or replace function public.is_exam_staff(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from exam_session_staff s
                 where s.session_id = p_session_id and s.teacher_id = auth.uid());
$$;

-- Suis-je inscrit a cette session ?
create or replace function public.is_exam_candidate(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from exam_sessions e
                 join roster r on r.class_id = e.container_class_id
                 where e.id = p_session_id and r.student_id = auth.uid());
$$;

-- La session accepte-t-elle les candidats en ce moment ?
-- Le bouton du prof prime ; l'horaire sert de filet.
create or replace function public.exam_is_open(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from exam_sessions e
    where e.id = p_session_id
      and e.closed_at is null
      and (e.closes_at is null or now() < e.closes_at)
      and (e.opened_at is not null or (e.opens_at is not null and now() >= e.opens_at))
  );
$$;

-- LE COEUR. Cette epreuve est-elle lisible par la personne connectee ?
--   - il faut etre inscrit et la session ouverte ;
--   - toutes les epreuves precedentes doivent etre rendues ;
--   - celle-ci ne doit pas l'etre encore (une copie rendue est ramassee) ;
--   - sauf apres publication des resultats, ou tout redevient lisible
--     pour que l'etudiant puisse relire sa copie corrigee.
create or replace function public.exam_item_readable(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
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
          -- aucune epreuve precedente non rendue
          and not exists (
            select 1 from exam_session_items prev
            where prev.session_id = i.session_id
              and prev.order_index < i.order_index
              and not exists (select 1 from exam_attempts a
                              where a.assignment_id = prev.assignment_id
                                and a.student_id = auth.uid()
                                and a.submitted_at is not null)
          )
          -- et celle-ci pas encore rendue
          and not exists (select 1 from exam_attempts a
                          where a.assignment_id = i.assignment_id
                            and a.student_id = auth.uid()
                            and a.submitted_at is not null)
        )
      )
  );
$$;

revoke all on function public.is_exam_staff(uuid)       from public, anon;
revoke all on function public.is_exam_candidate(uuid)   from public, anon;
revoke all on function public.exam_is_open(uuid)        from public, anon;
revoke all on function public.exam_item_readable(uuid)  from public, anon;
grant execute on function public.is_exam_staff(uuid)      to authenticated;
grant execute on function public.is_exam_candidate(uuid)  to authenticated;
grant execute on function public.exam_is_open(uuid)       to authenticated;
grant execute on function public.exam_item_readable(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. can_read_assignment apprend les examens.
--
--    Une classe ordinaire : etre inscrit suffit, comme avant.
--    Un contenant d'examen : etre inscrit NE SUFFIT PAS — il faut que
--    l'epreuve soit deverrouillee. C'est la que le verrouillage cesse
--    d'etre un affichage pour devenir une regle.
-- ---------------------------------------------------------------------

create or replace function public.can_read_assignment(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from assignments a
    join classes c on c.id = a.class_id
    where a.id = p_assignment_id
      and (
        -- le prof proprietaire du contenant
        c.teacher_id = auth.uid()
        -- un prof invite sur la session
        or (c.kind = 'exam' and exists (
              select 1 from exam_sessions e
              where e.container_class_id = c.id and public.is_exam_staff(e.id)))
        -- une classe ordinaire : l'inscription suffit
        or (c.kind = 'class' and exists (
              select 1 from roster r where r.class_id = c.id and r.student_id = auth.uid()))
        -- une session d'examen : l'epreuve doit etre deverrouillee
        or (c.kind = 'exam' and public.exam_item_readable(p_assignment_id))
      )
  );
$$;

-- Le prof invite doit pouvoir gerer le contenant comme le proprietaire.
create or replace function public.is_class_teacher(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes c where c.id = p_class_id and c.teacher_id = auth.uid())
      or exists (select 1 from exam_sessions e
                 where e.container_class_id = p_class_id and public.is_exam_staff(e.id));
$$;

-- ---------------------------------------------------------------------
-- 5. Les regles de lecture et d'ecriture des trois nouvelles tables
-- ---------------------------------------------------------------------

drop policy if exists "exam sessions readable by staff or candidate" on public.exam_sessions;
create policy "exam sessions readable by staff or candidate"
  on public.exam_sessions for select
  using (public.is_exam_staff(id) or public.is_exam_candidate(id));

drop policy if exists "exam sessions written by staff" on public.exam_sessions;
create policy "exam sessions written by staff"
  on public.exam_sessions for update
  using (public.is_exam_staff(id)) with check (public.is_exam_staff(id));

drop policy if exists "exam sessions deleted by creator" on public.exam_sessions;
create policy "exam sessions deleted by creator"
  on public.exam_sessions for delete using (created_by = auth.uid());

drop policy if exists "exam staff readable by staff" on public.exam_session_staff;
create policy "exam staff readable by staff"
  on public.exam_session_staff for select using (public.is_exam_staff(session_id));

drop policy if exists "exam staff managed by creator" on public.exam_session_staff;
create policy "exam staff managed by creator"
  on public.exam_session_staff for all
  using (exists (select 1 from exam_sessions e where e.id = session_id and e.created_by = auth.uid()))
  with check (exists (select 1 from exam_sessions e where e.id = session_id and e.created_by = auth.uid()));

drop policy if exists "exam items readable by staff or candidate" on public.exam_session_items;
create policy "exam items readable by staff or candidate"
  on public.exam_session_items for select
  using (public.is_exam_staff(session_id) or public.is_exam_candidate(session_id));

drop policy if exists "exam items managed by staff" on public.exam_session_items;
create policy "exam items managed by staff"
  on public.exam_session_items for all
  using (public.is_exam_staff(session_id)) with check (public.is_exam_staff(session_id));

-- ---------------------------------------------------------------------
-- 6. Creer une session : la session, son contenant prive, son code,
--    et le createur comme premier prof — le tout d'un bloc.
-- ---------------------------------------------------------------------

create or replace function public.create_exam_session(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_teacher uuid := auth.uid();
  v_role    text;
  v_code    text;
  v_class   uuid;
  v_session uuid;
  v_try     integer := 0;
begin
  if v_teacher is null then raise exception 'Not authenticated'; end if;
  select role into v_role from profiles where id = v_teacher;
  if v_role is distinct from 'teacher' then raise exception 'Only a teacher can create an exam'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'A name is required'; end if;

  -- Un code court, unique, jamais celui d'une classe.
  loop
    v_try := v_try + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from classes where upper(code) = v_code)
          and not exists (select 1 from exam_sessions where upper(code) = v_code);
    if v_try > 20 then raise exception 'Could not allocate a code'; end if;
  end loop;

  insert into classes (name, teacher_id, code, kind)
  values (left(trim(p_name), 120), v_teacher, 'EX-' || v_code, 'exam')
  returning id into v_class;

  insert into exam_sessions (name, code, container_class_id, created_by)
  values (left(trim(p_name), 120), v_code, v_class, v_teacher)
  returning id into v_session;

  insert into exam_session_staff (session_id, teacher_id, role) values (v_session, v_teacher, 'owner');

  return jsonb_build_object('session_id', v_session, 'code', v_code, 'container_class_id', v_class);
end $$;

-- ---------------------------------------------------------------------
-- 7. Rejoindre une session avec le code
-- ---------------------------------------------------------------------

create or replace function public.join_exam(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_class uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_code is null or length(trim(p_code)) < 4 or length(trim(p_code)) > 12 then
    raise exception 'Invalid code';
  end if;
  select e.id, e.container_class_id, e.name into v_session, v_class, v_name
  from exam_sessions e where upper(e.code) = upper(trim(p_code));
  if v_session is null then raise exception 'No exam found with that code'; end if;
  if not public.exam_is_open(v_session) then raise exception 'This exam is not open yet'; end if;

  insert into roster (class_id, student_id) values (v_class, auth.uid()) on conflict do nothing;
  return jsonb_build_object('session_id', v_session, 'name', v_name);
end $$;

-- Un code de classe ne doit jamais ouvrir une session, et inversement.
create or replace function public.join_class(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_code is null or length(trim(p_code)) < 3 or length(trim(p_code)) > 12 then
    raise exception 'Invalid code';
  end if;
  select id, name into v_id, v_name from classes
   where upper(code) = upper(trim(p_code)) and kind = 'class';
  if v_id is null then raise exception 'No class found with that code'; end if;
  insert into roster(class_id, student_id) values (v_id, auth.uid()) on conflict do nothing;
  return jsonb_build_object('class_id', v_id, 'name', v_name);
end $$;

-- ---------------------------------------------------------------------
-- 8. Ouvrir, fermer, publier, lancer l'audio
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 9. L'etat d'une session pour la personne connectee.
--    C'est le serveur qui dit ce qui est ouvert, verrouille ou fini —
--    l'ecran ne fait que l'afficher.
-- ---------------------------------------------------------------------

create or replace function public.exam_session_status(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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
end $$;

revoke all on function public.create_exam_session(text)            from public, anon;
revoke all on function public.join_exam(text)                      from public, anon;
revoke all on function public.exam_session_action(uuid, text, uuid) from public, anon;
revoke all on function public.exam_session_status(uuid)            from public, anon;
grant execute on function public.create_exam_session(text)            to authenticated;
grant execute on function public.join_exam(text)                      to authenticated;
grant execute on function public.exam_session_action(uuid, text, uuid) to authenticated;
grant execute on function public.exam_session_status(uuid)            to authenticated;

-- ---------------------------------------------------------------------
-- 10. Demarrer une epreuve : le chrono ne part que si elle est
--     deverrouillee. C'est la deuxieme barriere, apres la lecture.
-- ---------------------------------------------------------------------

create or replace function public.exam_start_item(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.exam_item_readable(p_assignment_id) then
    raise exception 'This part is not open yet';
  end if;
  return public.exam_timer_status(p_assignment_id, true);
end $$;

revoke all on function public.exam_start_item(uuid) from public, anon;
grant execute on function public.exam_start_item(uuid) to authenticated;

commit;

-- =====================================================================
--  VERIFICATIONS
-- =====================================================================

-- V1. Les trois tables et leurs regles existent.
select tablename, cmd, policyname from pg_policies
where schemaname='public' and tablename like 'exam_session%' order by tablename, cmd;

-- V2. Les fonctions sont reservees aux comptes connectes.
select p.proname, array_to_string(p.proacl,' | ') as droits
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('create_exam_session','join_exam','exam_session_action','exam_session_status',
  'exam_start_item','exam_item_readable','exam_is_open','is_exam_staff','is_exam_candidate')
order by p.proname;

-- V3. Aucune classe existante n'a change de nature.
select kind, count(*) from public.classes group by kind;
-- Attendu : uniquement 'class' pour l'instant.
