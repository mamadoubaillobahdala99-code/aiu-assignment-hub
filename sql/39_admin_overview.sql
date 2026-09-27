-- =====================================================================
-- 39_admin_overview.sql — livraison 60
-- L'écran « Admin » (lecture seule) pour l'administrateur du site.
--
-- CE QUE FAIT CE FICHIER
--   1. app_admins : la liste des administrateurs du site. RLS activée,
--      AUCUNE règle, AUCUN droit : personne ne peut la lire ni l'écrire
--      depuis le site ; seules les fonctions de la base y touchent.
--      On s'y ajoute avec sql/nommer_admin.sql (Mamadou, dans Supabase).
--   2. is_app_admin() : « le compte connecté est-il administrateur ? »
--      (sert seulement à afficher ou non l'entrée « Admin » du menu).
--   3. admin_overview() : ce que montre l'écran Admin, pour un
--      administrateur SEULEMENT (tout autre compte : « Not allowed ») :
--        - le nombre de profs, d'étudiants et de classes ;
--        - pour les étudiants, des CHIFFRES seulement (actifs depuis
--          30 jours, dans aucune classe) — jamais leurs noms ;
--        - la liste des profs : nom, e-mail, classes, inscription,
--          dernière connexion.
--
-- NE CHANGE RIEN d'autre : aucun rôle, aucune donnée, aucune règle existante.
--
-- Script complet et ré-exécutable. Attendu : 6 lignes « OK ».
-- Retour arrière : bloc tout en bas.
-- =====================================================================

begin;

-- 1. Les administrateurs du site (illisible pour tous).
create table if not exists public.app_admins (
  user_id  uuid        primary key references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'app_admins' loop
    execute format('drop policy %I on public.app_admins', p.policyname);
  end loop;
end $$;
revoke all on public.app_admins from public, anon, authenticated;

-- 2. Le compte connecté est-il administrateur ?
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from app_admins a where a.user_id = auth.uid());
$$;

revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

-- 3. Ce que montre l'écran Admin.
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

commit;

-- ---------------------------------------------------------------------
-- CONTRÔLES (lecture seule) — chaque ligne doit afficher « OK »
-- ---------------------------------------------------------------------
select '1. app_admins : RLS activée, aucune règle' as controle,
       case when (select relrowsecurity from pg_class where oid = 'public.app_admins'::regclass)
             and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_admins')
            then 'OK' else 'PROBLEME' end as resultat
union all
select '2. app_admins : aucun droit pour anon ni pour les comptes connectés',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and table_name = 'app_admins'
                               and grantee in ('anon', 'authenticated', 'PUBLIC'))
            then 'OK' else 'PROBLEME' end
union all
select '3. is_app_admin et admin_overview : connectés seulement, jamais anon',
       case when has_function_privilege('authenticated', 'public.is_app_admin()', 'execute')
             and has_function_privilege('authenticated', 'public.admin_overview()', 'execute')
             and not has_function_privilege('anon', 'public.is_app_admin()', 'execute')
             and not has_function_privilege('anon', 'public.admin_overview()', 'execute')
            then 'OK' else 'PROBLEME' end
union all
select '4. les deux fonctions : security definer, search_path = public',
       case when (select count(*) from pg_proc
                  where oid in ('public.is_app_admin()'::regprocedure, 'public.admin_overview()'::regprocedure)
                    and prosecdef and proconfig @> array['search_path=public']) = 2 then 'OK' else 'PROBLEME' end
union all
select '5. admin_overview vérifie l''administrateur',
       case when (select prosrc from pg_proc where oid = 'public.admin_overview()'::regprocedure) like '%Not allowed%'
            then 'OK' else 'PROBLEME' end
union all
select '6. anon n''a toujours aucun droit sur les tables de public',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLEME' end;

/* =====================================================================
   RETOUR ARRIÈRE — supprime l'écran Admin côté base (la liste des
   administrateurs est perdue ; rien d'autre n'est touché).

begin;
drop function if exists public.admin_overview();
drop function if exists public.is_app_admin();
drop table if exists public.app_admins;
commit;

   ===================================================================== */
