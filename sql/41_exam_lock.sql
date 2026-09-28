-- =====================================================================
-- 41_exam_lock.sql — livraison 62
-- Verrouiller les tables de l'examen : ce que le site fait passe par les
-- boutons (fonctions de la base) ; ce qu'il ne fait pas devient impossible.
--
-- TROUS FERMÉS
--   1. Épreuves d'un examen (exam_session_items) : un prof pouvait créer
--      son propre examen et y ajouter un devoir d'une AUTRE classe, donc
--      lire les copies et changer les notes de Writing des élèves d'un
--      autre prof. Maintenant : seulement une épreuve de la classe interne
--      de CET examen, et seulement avant que l'examen ait commencé ; seul
--      l'ordre est modifiable ; l'heure de départ du Listening en groupe
--      passe seulement par son bouton.
--   2. Fiche d'examen (exam_sessions) : plus de modification directe de
--      l'ouverture, de la fermeture, de la publication (plus de
--      « dépublication »), du créateur, de la classe ni du code. Seuls les
--      4 réglages restent modifiables par le site (strict, départ du
--      Listening, heures d'ouverture et de fin) — et SEULEMENT quand
--      l'examen n'est pas en cours. Supprimer : seulement par le bouton
--      (fonction delete_exam_session).
--   3. Prolonger l'heure de fin pendant l'examen : nouvelle fonction
--      exam_extend_end (staff), qui ne peut que RECULER l'heure de fin.
--      Pour fermer plus tôt : le bouton Close.
--   4. Profs de l'examen (exam_session_staff) : le créateur ne peut
--      ajouter que des comptes PROF, avec le rôle « co » ; la ligne du
--      créateur ne peut pas être retirée ; plus de modification directe.
--   5. Incidents, copies, écoutes (exam_incidents, exam_attempts,
--      listening_plays) : droits d'écriture inutiles retirés (déjà
--      bloqués par la RLS ; le site n'y écrit jamais directement).
--
-- NE CHANGE PAS : les données existantes (vérifié avant : aucune épreuve
-- hors de la classe interne de son examen), la lecture, les boutons.
--
-- Script complet et ré-exécutable. Attendu : 9 lignes « OK ».
-- Retour arrière : bloc tout en bas.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Aides (lues par les règles ; SECURITY DEFINER pour voir la fiche de
-- l'examen et les rôles sans dépendre de ce que le compte peut lire).
-- ---------------------------------------------------------------------

-- L'examen n'a pas encore commencé (ni ouvert à la main, ni par l'heure
-- d'ouverture, ni fermé, ni publié).
create or replace function public.exam_not_started(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from exam_sessions e
    where e.id = p_session_id
      and e.opened_at is null
      and e.closed_at is null
      and e.results_released_at is null
      and (e.opens_at is null or now() < e.opens_at)
  );
$$;

-- Cette épreuve appartient bien à la classe interne de CET examen.
create or replace function public.exam_item_belongs(p_session_id uuid, p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from exam_sessions e join assignments a on a.class_id = e.container_class_id
    where e.id = p_session_id and a.id = p_assignment_id
  );
$$;

-- Le compte connecté est le créateur de l'examen ET l'invité est un prof.
-- (Réservé au créateur : un autre compte ne peut pas s'en servir pour
-- savoir qui est prof.)
create or replace function public.exam_can_add_staff(p_session_id uuid, p_teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from exam_sessions e where e.id = p_session_id and e.created_by = auth.uid())
     and exists (select 1 from profiles p where p.id = p_teacher_id and p.role = 'teacher')
     and p_teacher_id <> auth.uid();
$$;

-- Le compte connecté est le créateur de l'examen.
create or replace function public.is_exam_creator(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from exam_sessions e where e.id = p_session_id and e.created_by = auth.uid());
$$;

revoke all on function public.exam_not_started(uuid) from public, anon;
revoke all on function public.exam_item_belongs(uuid, uuid) from public, anon;
revoke all on function public.exam_can_add_staff(uuid, uuid) from public, anon;
revoke all on function public.is_exam_creator(uuid) from public, anon;
grant execute on function public.exam_not_started(uuid) to authenticated;
grant execute on function public.exam_item_belongs(uuid, uuid) to authenticated;
grant execute on function public.exam_can_add_staff(uuid, uuid) to authenticated;
grant execute on function public.is_exam_creator(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 1. Les épreuves de l'examen.
-- ---------------------------------------------------------------------
drop policy if exists "exam items managed by staff" on public.exam_session_items;
drop policy if exists "exam items added by staff before start" on public.exam_session_items;
drop policy if exists "exam items reordered by staff before start" on public.exam_session_items;
drop policy if exists "exam items removed by staff before start" on public.exam_session_items;

create policy "exam items added by staff before start" on public.exam_session_items
  for insert
  with check (public.is_exam_staff(session_id)
              and public.exam_not_started(session_id)
              and public.exam_item_belongs(session_id, assignment_id));

create policy "exam items reordered by staff before start" on public.exam_session_items
  for update
  using (public.is_exam_staff(session_id) and public.exam_not_started(session_id))
  with check (public.is_exam_staff(session_id)
              and public.exam_not_started(session_id)
              and public.exam_item_belongs(session_id, assignment_id));

create policy "exam items removed by staff before start" on public.exam_session_items
  for delete
  using (public.is_exam_staff(session_id) and public.exam_not_started(session_id));

-- Seules ces colonnes : pas d'heure de départ du Listening, pas d'id.
revoke insert, update on public.exam_session_items from authenticated;
grant insert (session_id, assignment_id, order_index) on public.exam_session_items to authenticated;
grant update (order_index) on public.exam_session_items to authenticated;

-- ---------------------------------------------------------------------
-- 2. La fiche de l'examen.
-- ---------------------------------------------------------------------
drop policy if exists "exam sessions deleted by creator" on public.exam_sessions;
revoke insert, update, delete on public.exam_sessions from authenticated;
grant update (strict_mode, listening_start, opens_at, closes_at) on public.exam_sessions to authenticated;

-- Les 4 réglages ne changent pas pendant l'examen quand la demande vient
-- directement du site (rôle authenticated). Les fonctions de la base
-- (boutons, prolongation) s'exécutent sous leur propriétaire : elles ne
-- sont pas concernées.
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

drop trigger if exists exam_settings_guard on public.exam_sessions;
create trigger exam_settings_guard
  before update on public.exam_sessions
  for each row execute function public.exam_settings_guard();

-- ---------------------------------------------------------------------
-- 3. Prolonger l'heure de fin pendant l'examen (jamais l'avancer).
-- ---------------------------------------------------------------------
create or replace function public.exam_extend_end(p_session_id uuid, p_minutes integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  e record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 180 then
    raise exception 'Choose between 1 and 180 minutes';
  end if;

  select * into e from exam_sessions where id = p_session_id for update;
  if e.results_released_at is not null then raise exception 'The results are published'; end if;
  if e.closed_at is not null then raise exception 'The exam is closed'; end if;
  if e.closes_at is null then raise exception 'This exam has no end time'; end if;
  if now() >= e.closes_at then raise exception 'The end time has passed: use Open to start again'; end if;

  update exam_sessions set closes_at = e.closes_at + make_interval(mins => p_minutes)
   where id = p_session_id;

  return jsonb_build_object('closes_at', e.closes_at + make_interval(mins => p_minutes));
end $$;

revoke all on function public.exam_extend_end(uuid, integer) from public, anon;
grant execute on function public.exam_extend_end(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Les profs de l'examen.
-- ---------------------------------------------------------------------
drop policy if exists "exam staff managed by creator" on public.exam_session_staff;
drop policy if exists "exam staff added by creator" on public.exam_session_staff;
drop policy if exists "exam staff removed by creator" on public.exam_session_staff;

create policy "exam staff added by creator" on public.exam_session_staff
  for insert
  with check (role = 'co' and public.exam_can_add_staff(session_id, teacher_id));

create policy "exam staff removed by creator" on public.exam_session_staff
  for delete
  using (role <> 'owner' and public.is_exam_creator(session_id));

revoke insert, update on public.exam_session_staff from authenticated;
grant insert (session_id, teacher_id, role) on public.exam_session_staff to authenticated;

-- ---------------------------------------------------------------------
-- 5. Incidents, copies, écoutes : écriture seulement par la base.
-- ---------------------------------------------------------------------
revoke insert, update, delete on public.exam_incidents  from authenticated;
revoke insert, update, delete on public.exam_attempts   from authenticated;
revoke insert, update, delete on public.listening_plays from authenticated;

commit;

-- ---------------------------------------------------------------------
-- CONTRÔLES (lecture seule) — chaque ligne doit afficher « OK »
-- ---------------------------------------------------------------------
select '1. épreuves : ajout seulement de la classe interne, avant le début' as controle,
       case when (select with_check from pg_policies where schemaname = 'public' and tablename = 'exam_session_items'
                  and policyname = 'exam items added by staff before start') like '%exam_item_belongs%'
             and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'exam_session_items' and cmd = 'ALL')
            then 'OK' else 'PROBLEME' end as resultat
union all
select '2. épreuves : seul l''ordre est modifiable directement',
       case when has_column_privilege('authenticated', 'public.exam_session_items', 'order_index', 'update')
             and not has_column_privilege('authenticated', 'public.exam_session_items', 'audio_started_at', 'update')
             and not has_column_privilege('authenticated', 'public.exam_session_items', 'assignment_id', 'update')
            then 'OK' else 'PROBLEME' end
union all
select '3. fiche d''examen : seuls les 4 réglages sont modifiables directement',
       case when has_column_privilege('authenticated', 'public.exam_sessions', 'strict_mode', 'update')
             and has_column_privilege('authenticated', 'public.exam_sessions', 'closes_at', 'update')
             and not has_column_privilege('authenticated', 'public.exam_sessions', 'results_released_at', 'update')
             and not has_column_privilege('authenticated', 'public.exam_sessions', 'closed_at', 'update')
             and not has_column_privilege('authenticated', 'public.exam_sessions', 'created_by', 'update')
             and not has_column_privilege('authenticated', 'public.exam_sessions', 'container_class_id', 'update')
             and not has_table_privilege('authenticated', 'public.exam_sessions', 'delete')
            then 'OK' else 'PROBLEME' end
union all
select '4. réglages verrouillés pendant l''examen (déclencheur actif)',
       case when exists (select 1 from pg_trigger where tgname = 'exam_settings_guard'
                         and tgrelid = 'public.exam_sessions'::regclass and tgenabled = 'O')
            then 'OK' else 'PROBLEME' end
union all
select '5. prolonger : exam_extend_end, connectés seulement, jamais anon',
       case when has_function_privilege('authenticated', 'public.exam_extend_end(uuid, integer)', 'execute')
             and not has_function_privilege('anon', 'public.exam_extend_end(uuid, integer)', 'execute')
            then 'OK' else 'PROBLEME' end
union all
select '6. profs de l''examen : seulement des profs « co », le créateur reste',
       case when (select with_check from pg_policies where schemaname = 'public' and tablename = 'exam_session_staff'
                  and policyname = 'exam staff added by creator') like '%exam_can_add_staff%'
             and (select qual from pg_policies where schemaname = 'public' and tablename = 'exam_session_staff'
                  and policyname = 'exam staff removed by creator') like '%owner%'
             and not has_table_privilege('authenticated', 'public.exam_session_staff', 'update')
            then 'OK' else 'PROBLEME' end
union all
select '7. incidents, copies, écoutes : aucune écriture directe',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'authenticated'
                               and table_name in ('exam_incidents', 'exam_attempts', 'listening_plays')
                               and privilege_type in ('INSERT', 'UPDATE', 'DELETE'))
            then 'OK' else 'PROBLEME' end
union all
select '8. nouvelles fonctions : security definer, search_path = public, jamais anon',
       case when (select count(*) from pg_proc
                  where oid in ('public.exam_not_started(uuid)'::regprocedure, 'public.exam_item_belongs(uuid, uuid)'::regprocedure,
                                'public.exam_can_add_staff(uuid, uuid)'::regprocedure, 'public.is_exam_creator(uuid)'::regprocedure,
                                'public.exam_extend_end(uuid, integer)'::regprocedure)
                    and prosecdef and proconfig @> array['search_path=public']
                    and not has_function_privilege('anon', oid, 'execute')) = 5 then 'OK' else 'PROBLEME' end
union all
select '9. anon n''a toujours aucun droit sur les tables de public',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLEME' end;

/* =====================================================================
   RETOUR ARRIÈRE — remet les règles et les droits d'avant le 41.
   ⚠️ Il rouvre les trous décrits en haut.

begin;

drop trigger if exists exam_settings_guard on public.exam_sessions;
drop function if exists public.exam_settings_guard();
drop function if exists public.exam_extend_end(uuid, integer);

drop policy if exists "exam items added by staff before start" on public.exam_session_items;
drop policy if exists "exam items reordered by staff before start" on public.exam_session_items;
drop policy if exists "exam items removed by staff before start" on public.exam_session_items;
create policy "exam items managed by staff" on public.exam_session_items
  for all
  using (is_exam_staff(session_id))
  with check (is_exam_staff(session_id));

drop policy if exists "exam staff added by creator" on public.exam_session_staff;
drop policy if exists "exam staff removed by creator" on public.exam_session_staff;
create policy "exam staff managed by creator" on public.exam_session_staff
  for all
  using (exists (select 1 from exam_sessions e where e.id = exam_session_staff.session_id and e.created_by = auth.uid()))
  with check (exists (select 1 from exam_sessions e where e.id = exam_session_staff.session_id and e.created_by = auth.uid()));

create policy "exam sessions deleted by creator" on public.exam_sessions
  for delete
  using (created_by = auth.uid());

grant insert, update, delete on public.exam_sessions      to authenticated;
grant insert, update, delete on public.exam_session_items to authenticated;
grant insert, update, delete on public.exam_session_staff to authenticated;
grant insert, update, delete on public.exam_incidents     to authenticated;
grant insert, update, delete on public.exam_attempts      to authenticated;
grant insert, update, delete on public.listening_plays    to authenticated;

drop function if exists public.exam_not_started(uuid);
drop function if exists public.exam_item_belongs(uuid, uuid);
drop function if exists public.exam_can_add_staff(uuid, uuid);
drop function if exists public.is_exam_creator(uuid);

commit;

   ===================================================================== */
