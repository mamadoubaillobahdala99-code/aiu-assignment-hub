-- =====================================================================
-- 40_teacher_requests.sql — livraison 61
-- Demander l'accès prof, et l'approuver ou le refuser depuis l'écran Admin.
--
-- CE QUE FAIT CE FICHIER
--   1. teacher_requests : une ligne par compte (en attente / approuvée /
--      refusée, dates, qui a décidé). RLS activée, AUCUNE règle, AUCUN
--      droit : seules les fonctions de la base y touchent.
--   2. handle_new_user : si la case « I'm a teacher » est cochée à
--      l'inscription, une DEMANDE est créée. Le compte reste étudiant.
--      Ce bloc ne peut jamais faire échouer une inscription.
--   3. request_teacher_access() : un ÉTUDIANT demande (bouton du Profil).
--      Déjà en attente : rien ne change. Refusée il y a moins de 7 jours :
--      rien ne change (la base le vérifie, pas la page).
--   4. my_teacher_request() : chacun voit seulement SA demande.
--   5. admin_decide_teacher_request(compte, approuver) : ADMIN seulement.
--      Vérifie que la demande est encore en attente et, pour « Approve »,
--      que le compte est encore étudiant. Double clic ou deux onglets : la
--      deuxième décision ne fait rien.
--   6. admin_overview : ajoute la liste des demandes en attente.
--
-- Script complet et ré-exécutable. Attendu : 8 lignes « OK ».
-- Retour arrière : bloc tout en bas (remet handle_new_user du 37 et
-- admin_overview du 39 à l'identique).
-- =====================================================================

begin;

-- 1. Les demandes (illisibles pour tous).
create table if not exists public.teacher_requests (
  user_id      uuid        primary key references public.profiles (id) on delete cascade,
  status       text        not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid        references public.profiles (id) on delete set null
);
alter table public.teacher_requests enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'teacher_requests' loop
    execute format('drop policy %I on public.teacher_requests', p.policyname);
  end loop;
end $$;
revoke all on public.teacher_requests from public, anon, authenticated;

-- 2. L'inscription : la case crée une demande, jamais le rôle prof.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  -- NOUVEAU (37) : le rôle envoyé par la page d'inscription est IGNORÉ.
  -- Seul l'administrateur donne le rôle prof (sql/nommer_prof.sql).
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'User'),
    'student'
  );

  -- NOUVEAU (40) : la case « I'm a teacher — request teacher access ».
  -- Seulement une DEMANDE, jamais le rôle prof. Ce bloc ne peut jamais
  -- faire échouer une inscription : valeur bizarre ou problème
  -- d'insertion = compte créé normalement (étudiant), sans demande.
  begin
    if lower(coalesce(new.raw_user_meta_data->>'teacher_request', '')) = 'true' then
      insert into public.teacher_requests (user_id, status)
      values (new.id, 'pending')
      on conflict (user_id) do nothing;
    end if;
  exception when others then
    null;
  end;

  return new;
end;
$fn$;

-- Fonction de déclencheur : appelable par personne (comme depuis le 11).
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 4. Ma demande (définie avant request_teacher_access, qui la renvoie).
create or replace function public.my_teacher_request()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  r      record;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select t.status, t.requested_at, t.decided_at into r
  from teacher_requests t where t.user_id = v_user;
  if not found then
    return jsonb_build_object('status', 'none');
  end if;
  return jsonb_build_object(
    'status',       r.status,
    'requested_at', r.requested_at,
    'decided_at',   r.decided_at,
    -- Après un refus : nouvelle demande possible 7 jours plus tard.
    'again_at',     case when r.status = 'declined' then r.decided_at + interval '7 days' end
  );
end $$;

revoke all on function public.my_teacher_request() from public, anon;
grant execute on function public.my_teacher_request() to authenticated;

-- 3. Un étudiant demande l'accès prof.
create or replace function public.request_teacher_access()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  r      record;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select p.role into v_role from profiles p where p.id = v_user;
  if v_role is null then raise exception 'Not allowed'; end if;
  if v_role = 'teacher' then raise exception 'You already have teacher access'; end if;

  -- Une ligne par compte ; la verrouiller évite deux demandes mêlées
  -- (double clic, deux onglets, ou une décision de l'admin au même instant).
  insert into teacher_requests (user_id, status) values (v_user, 'pending')
  on conflict (user_id) do nothing;
  select t.status, t.decided_at into r from teacher_requests t where t.user_id = v_user for update;

  if r.status = 'declined' and r.decided_at > now() - interval '7 days' then
    null;                                   -- trop tôt : rien ne change
  elsif r.status in ('declined', 'approved') then
    -- Refus d'il y a 7 jours ou plus, ou ancien accord (rôle retiré depuis) :
    -- nouvelle demande.
    update teacher_requests
       set status = 'pending', requested_at = now(), decided_at = null, decided_by = null
     where user_id = v_user;
  end if;                                   -- déjà en attente : rien ne change

  return public.my_teacher_request();
end $$;

revoke all on function public.request_teacher_access() from public, anon;
grant execute on function public.request_teacher_access() to authenticated;

-- 5. L'admin approuve ou refuse.
create or replace function public.admin_decide_teacher_request(p_user_id uuid, p_approve boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  r       record;
begin
  if v_admin is null then raise exception 'Not authenticated'; end if;
  if not public.is_app_admin() then raise exception 'Not allowed'; end if;
  if p_approve is null then raise exception 'Approve or decline?'; end if;

  select t.status into r from teacher_requests t where t.user_id = p_user_id for update;
  if not found then raise exception 'No such request'; end if;

  -- Déjà décidée (double clic, deux onglets) : rien ne change.
  if r.status <> 'pending' then
    return jsonb_build_object('result', 'already', 'status', r.status);
  end if;

  if p_approve then
    update profiles set role = 'teacher' where id = p_user_id and role = 'student';
    if not found then
      -- Plus étudiant (déjà prof) : le rôle ne bouge pas ; la demande est close.
      update teacher_requests set status = 'approved', decided_at = now(), decided_by = v_admin
       where user_id = p_user_id;
      return jsonb_build_object('result', 'not_student', 'status', 'approved');
    end if;
    update teacher_requests set status = 'approved', decided_at = now(), decided_by = v_admin
     where user_id = p_user_id;
    return jsonb_build_object('result', 'approved', 'status', 'approved');
  end if;

  update teacher_requests set status = 'declined', decided_at = now(), decided_by = v_admin
   where user_id = p_user_id;
  return jsonb_build_object('result', 'declined', 'status', 'declined');
end $$;

revoke all on function public.admin_decide_teacher_request(uuid, boolean) from public, anon;
grant execute on function public.admin_decide_teacher_request(uuid, boolean) to authenticated;

-- 6. L'écran Admin : + les demandes en attente.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_app_admin() then raise exception 'Not allowed'; end if;

  return jsonb_build_object(
    'teachers', (select count(*) from profiles p where p.role = 'teacher'),
    'students', (select count(*) from profiles p where p.role = 'student'),
    -- Étudiants : des chiffres seulement, jamais de noms.
    'students_active_30d', (select count(*) from profiles p join auth.users u on u.id = p.id
                            where p.role = 'student' and u.last_sign_in_at > now() - interval '30 days'),
    'students_no_class', (select count(*) from profiles p
                          where p.role = 'student'
                            and not exists (select 1 from roster r join classes c on c.id = r.class_id
                                            where r.student_id = p.id and c.kind = 'class')),
    'classes', (select count(*) from classes c where c.kind = 'class'),
    -- NOUVEAU (40) : les demandes d'accès prof EN ATTENTE (nom et e-mail de
    -- ceux qui demandent seulement ; les autres étudiants restent comptés).
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id',      t.user_id,
               'name',         p.name,
               'email',        u.email,
               'requested_at', t.requested_at)
             order by t.requested_at)
      from teacher_requests t
      join profiles p on p.id = t.user_id
      join auth.users u on u.id = t.user_id
      where t.status = 'pending'), '[]'::jsonb),
    'teacher_list', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',       p.name,
               'email',      u.email,
               'classes',    (select count(*) from classes c where c.teacher_id = p.id and c.kind = 'class'),
               'signed_up',  p.created_at,
               'last_login', u.last_sign_in_at,
               'admin',      exists (select 1 from app_admins a where a.user_id = p.id))
             order by p.name)
      from profiles p join auth.users u on u.id = p.id
      where p.role = 'teacher'), '[]'::jsonb),
    'server_now', now()
  );
end $$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

commit;

-- ---------------------------------------------------------------------
-- CONTRÔLES (lecture seule) — chaque ligne doit afficher « OK »
-- ---------------------------------------------------------------------
select '1. teacher_requests : RLS activée, aucune règle, aucun droit' as controle,
       case when (select relrowsecurity from pg_class where oid = 'public.teacher_requests'::regclass)
             and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'teacher_requests')
             and not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and table_name = 'teacher_requests'
                               and grantee in ('anon', 'authenticated', 'PUBLIC'))
            then 'OK' else 'PROBLEME' end as resultat
union all
select '2. inscription : toujours étudiant ; la demande ne peut pas faire échouer l''inscription',
       case when (select prosrc from pg_proc where oid = 'public.handle_new_user()'::regprocedure) not like '%->>''role''%'
             and (select prosrc from pg_proc where oid = 'public.handle_new_user()'::regprocedure) like '%exception when others then%'
            then 'OK' else 'PROBLEME' end
union all
select '3. le déclencheur d''inscription est toujours actif',
       case when exists (select 1 from pg_trigger
                         where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass
                           and tgenabled = 'O' and tgfoid = 'public.handle_new_user()'::regprocedure)
            then 'OK' else 'PROBLEME' end
union all
select '4. les 4 fonctions : connectés seulement, jamais anon',
       case when (select bool_and(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
                  from unnest(array['public.my_teacher_request()'::regprocedure, 'public.request_teacher_access()'::regprocedure,
                                    'public.admin_decide_teacher_request(uuid, boolean)'::regprocedure, 'public.admin_overview()'::regprocedure]) f)
            then 'OK' else 'PROBLEME' end
union all
select '5. les 4 fonctions : security definer, search_path = public',
       case when (select count(*) from pg_proc
                  where oid in ('public.my_teacher_request()'::regprocedure, 'public.request_teacher_access()'::regprocedure,
                                'public.admin_decide_teacher_request(uuid, boolean)'::regprocedure, 'public.admin_overview()'::regprocedure)
                    and prosecdef and proconfig @> array['search_path=public']) = 4 then 'OK' else 'PROBLEME' end
union all
select '6. décider : réservé à l''admin, seulement une demande en attente',
       case when (select prosrc from pg_proc where oid = 'public.admin_decide_teacher_request(uuid, boolean)'::regprocedure)
                 like '%is_app_admin()%'
             and (select prosrc from pg_proc where oid = 'public.admin_decide_teacher_request(uuid, boolean)'::regprocedure)
                 like '%<> ''pending''%'
            then 'OK' else 'PROBLEME' end
union all
select '7. handle_new_user : appelable par personne',
       case when not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute')
             and not has_function_privilege('anon', 'public.handle_new_user()', 'execute')
            then 'OK' else 'PROBLEME' end
union all
select '8. anon n''a toujours aucun droit sur les tables de public',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLEME' end;

/* =====================================================================
   RETOUR ARRIÈRE — remet handle_new_user (script 37) et admin_overview
   (script 39) à l'identique, puis supprime les demandes et les nouvelles
   fonctions.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  -- NOUVEAU (37) : le rôle envoyé par la page d'inscription est IGNORÉ.
  -- Seul l'administrateur donne le rôle prof (sql/nommer_prof.sql).
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'User'),
    'student'
  );
  return new;
end;
$fn$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_app_admin() then raise exception 'Not allowed'; end if;

  return jsonb_build_object(
    'teachers', (select count(*) from profiles p where p.role = 'teacher'),
    'students', (select count(*) from profiles p where p.role = 'student'),
    -- Étudiants : des chiffres seulement, jamais de noms.
    'students_active_30d', (select count(*) from profiles p join auth.users u on u.id = p.id
                            where p.role = 'student' and u.last_sign_in_at > now() - interval '30 days'),
    'students_no_class', (select count(*) from profiles p
                          where p.role = 'student'
                            and not exists (select 1 from roster r join classes c on c.id = r.class_id
                                            where r.student_id = p.id and c.kind = 'class')),
    'classes', (select count(*) from classes c where c.kind = 'class'),
    'teacher_list', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',       p.name,
               'email',      u.email,
               'classes',    (select count(*) from classes c where c.teacher_id = p.id and c.kind = 'class'),
               'signed_up',  p.created_at,
               'last_login', u.last_sign_in_at,
               'admin',      exists (select 1 from app_admins a where a.user_id = p.id))
             order by p.name)
      from profiles p join auth.users u on u.id = p.id
      where p.role = 'teacher'), '[]'::jsonb),
    'server_now', now()
  );
end $$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

drop function if exists public.admin_decide_teacher_request(uuid, boolean);
drop function if exists public.request_teacher_access();
drop function if exists public.my_teacher_request();
drop table if exists public.teacher_requests;

commit;

   ===================================================================== */
