-- =====================================================================
-- 37_teacher_signup.sql — livraison 58
-- Personne ne peut plus se déclarer prof tout seul.
--
-- AVANT :
--   - à l'inscription, handle_new_user prenait le rôle envoyé par la page
--     (« teacher » ou « student ») sans aucun contrôle ;
--   - la base ne vérifiait presque jamais le rôle : un compte ÉTUDIANT
--     pouvait créer une classe et des questions en appelant la base
--     directement (sans passer par le site).
--
-- CE QUE FAIT CE FICHIER
--   1. handle_new_user : tout nouveau compte est ÉTUDIANT, quoi que la page
--      envoie. Le nom reste celui tapé à l'inscription.
--   2. is_teacher() : « le compte connecté est-il prof ? » (lu dans profiles,
--      jamais dans ce que la page envoie).
--   3. Créer une classe : il faut être prof.
--   4. Créer ou modifier une question : il faut être prof. Lire et supprimer
--      ses propres questions : inchangé.
--   5. profiles : les comptes connectés ne peuvent plus ajouter ni supprimer
--      de profil (le site ne le fait jamais ; le profil est créé par la
--      base). Changer son nom : toujours possible. Changer son rôle :
--      toujours impossible (déjà le cas).
--
-- NE CHANGE PAS : les profs et étudiants existants, leurs classes, leurs
-- questions, leurs examens. create_exam_session vérifiait déjà le rôle.
--
-- Nommer un prof : sql/nommer_prof.sql (Mamadou, dans Supabase).
--
-- Script complet et ré-exécutable. Attendu : 7 lignes « OK ».
-- Retour arrière : bloc tout en bas.
-- =====================================================================

begin;

-- 1. Tout nouveau compte est étudiant.
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

-- Fonction de déclencheur : appelable par personne (comme depuis le 11).
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 2. Le compte connecté est-il prof ?
create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'teacher');
$$;

revoke all on function public.is_teacher() from public, anon;
grant execute on function public.is_teacher() to authenticated;

-- 3. Créer une classe : il faut être prof.
drop policy if exists "teachers can create classes" on public.classes;
create policy "teachers can create classes" on public.classes
  for insert
  with check (auth.uid() = teacher_id and public.is_teacher());

-- 4. Créer ou modifier une question : il faut être prof.
drop policy if exists "teacher manages own questions" on public.questions;
create policy "teacher manages own questions" on public.questions
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid() and public.is_teacher());

-- 5. profiles : plus d'ajout ni de suppression par les comptes connectés.
drop policy if exists "users can insert own profile" on public.profiles;
revoke insert, delete on public.profiles from authenticated;

commit;

-- ---------------------------------------------------------------------
-- CONTRÔLES (lecture seule) — chaque ligne doit afficher « OK »
-- ---------------------------------------------------------------------
select '1. inscription : le rôle envoyé par la page est ignoré' as controle,
       case when (select prosrc from pg_proc where oid = 'public.handle_new_user()'::regprocedure) not like '%->>''role''%'
             and (select prosrc from pg_proc where oid = 'public.handle_new_user()'::regprocedure) like '%''student''%'
            then 'OK' else 'PROBLEME' end as resultat
union all
select '2. le déclencheur d''inscription est toujours actif',
       case when exists (select 1 from pg_trigger
                         where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass
                           and tgenabled = 'O' and tgfoid = 'public.handle_new_user()'::regprocedure)
            then 'OK' else 'PROBLEME' end
union all
select '3. is_teacher : connectés seulement, jamais anon, security definer',
       case when has_function_privilege('authenticated', 'public.is_teacher()', 'execute')
             and not has_function_privilege('anon', 'public.is_teacher()', 'execute')
             and (select prosecdef and proconfig @> array['search_path=public'] from pg_proc where oid = 'public.is_teacher()'::regprocedure)
            then 'OK' else 'PROBLEME' end
union all
select '4. créer une classe : il faut être prof',
       case when (select with_check from pg_policies where schemaname = 'public' and tablename = 'classes'
                  and policyname = 'teachers can create classes') like '%is_teacher()%'
            then 'OK' else 'PROBLEME' end
union all
select '5. créer ou modifier une question : il faut être prof',
       case when (select with_check from pg_policies where schemaname = 'public' and tablename = 'questions'
                  and policyname = 'teacher manages own questions') like '%is_teacher()%'
            then 'OK' else 'PROBLEME' end
union all
select '6. profiles : ni ajout ni suppression ; seul le nom est modifiable',
       case when not has_table_privilege('authenticated', 'public.profiles', 'insert')
             and not has_table_privilege('authenticated', 'public.profiles', 'delete')
             and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd = 'INSERT')
             and has_column_privilege('authenticated', 'public.profiles', 'name', 'update')
             and not has_column_privilege('authenticated', 'public.profiles', 'role', 'update')
            then 'OK' else 'PROBLEME' end
union all
select '7. anon n''a toujours aucun droit sur les tables de public',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLEME' end;

/* =====================================================================
   RETOUR ARRIÈRE — à exécuter seulement pour revenir à l'état d'avant le 37.
   ⚠️ Il rouvre le trou : n'importe qui peut redevenir prof à l'inscription.
   =====================================================================

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'User'),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  );
  return new;
end;
$fn$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop policy if exists "teachers can create classes" on public.classes;
create policy "teachers can create classes" on public.classes
  for insert
  with check (auth.uid() = teacher_id);

drop policy if exists "teacher manages own questions" on public.questions;
create policy "teacher manages own questions" on public.questions
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

grant insert, delete on public.profiles to authenticated;
drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile" on public.profiles
  for insert
  with check (auth.uid() = id);

drop function if exists public.is_teacher();

commit;

   ===================================================================== */
