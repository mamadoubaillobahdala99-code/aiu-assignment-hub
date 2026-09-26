-- =====================================================================
-- 33_revoke_anon.sql — livraison 54 (point 2 de la liste)
-- Règle « jamais anon » : un visiteur NON connecté n'a plus aucun droit
-- sur les tables et les fonctions du schéma public.
--
-- CE QUI A ÉTÉ VÉRIFIÉ AVANT D'ÉCRIRE CE FICHIER (26/09/2026)
--   - Avant la connexion, le site ne lit AUCUNE table et n'appelle AUCUNE
--     fonction : connexion et inscription passent par le service Auth de
--     Supabase ; il n'y a pas de « mot de passe oublié ».
--   - Le profil est créé à l'inscription par le déclencheur
--     handle_new_user, qui s'exécute avec les droits de son propriétaire
--     (postgres) : les droits d'anon ne le concernent pas.
--   - anon ne voyait déjà AUCUNE ligne (0 ou « permission denied »).
--     Mais il gardait des droits dangereux en réserve, dont TRUNCATE
--     (vider une table), qui passe par-dessus la RLS.
--
-- CE QUE FAIT CE FICHIER
--   1. anon : plus aucun droit sur les tables de public.
--   2. authenticated : plus de TRUNCATE, TRIGGER, REFERENCES ni MAINTAIN
--      sur les tables de public (le site ne s'en sert jamais). SELECT,
--      INSERT, UPDATE, DELETE restent — la RLS décide des lignes.
--   3. Les 3 fonctions de déclencheur ne sont plus exécutables par tout
--      le monde ni par anon (un déclencheur n'a pas besoin de ce droit).
--   4. Réglages PAR DÉFAUT pour ce que postgres créera plus tard dans
--      public : sans ces lignes, chaque nouvelle table et chaque nouvelle
--      fonction redonneraient tous les droits à anon.
--        - nouvelles tables : rien pour anon ; authenticated reçoit
--          seulement SELECT, INSERT, UPDATE, DELETE ;
--        - nouvelles séquences : rien pour anon ;
--        - nouvelles fonctions : plus exécutables par tout le monde ni par
--          anon. Chaque nouveau script donne ses droits à authenticated
--          EXPLICITEMENT (c'est déjà notre règle).
--
-- Rien n'est supprimé, aucune donnée n'est touchée. RELANÇABLE.
-- Attendu : 8 lignes « OK ».
-- À coller dans Supabase → SQL Editor → Run.
-- Retour arrière : bloc tout en bas.
-- =====================================================================

begin;

-- 1. anon : plus rien sur les tables (et séquences) de public
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 2. authenticated : les 4 droits jamais utilisés
revoke truncate, trigger, references, maintain on all tables in schema public from authenticated;

-- 3. les 3 fonctions de déclencheur
revoke execute on function public.exam_live_content_guard()  from public, anon;
revoke execute on function public.exam_paper_release_guard() from public, anon;
revoke execute on function public.submissions_guard()        from public, anon;

-- 4. réglages par défaut (objets que postgres créera dans public)
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, trigger, references, maintain on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
-- « exécutable par tout le monde » est un réglage GLOBAL de Postgres :
-- il ne peut être retiré que pour tous les schémas de postgres à la fois.
alter default privileges for role postgres revoke execute on functions from public;

commit;

-- ---------------------------------------------------------------------
-- CONTRÔLES (lecture seule) — chaque ligne doit afficher « OK »
-- ---------------------------------------------------------------------
select 'anon : aucun droit sur les tables de public' as controle,
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLÈME' end as resultat
union all
select 'authenticated : plus de TRUNCATE / TRIGGER / REFERENCES / MAINTAIN',
       case when not exists (select 1 from pg_class c, aclexplode(c.relacl) a
                             where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                               and a.grantee = 'authenticated'::regrole
                               and a.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN')) then 'OK' else 'PROBLÈME' end
union all
select 'authenticated : lit toujours les 22 tables du site',
       case when (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                  and has_table_privilege('authenticated', c.oid, 'select')) = 22 then 'OK' else 'PROBLÈME' end
union all
select 'aucune fonction de public exécutable par anon',
       case when not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                             and has_function_privilege('anon', p.oid, 'execute')) then 'OK' else 'PROBLÈME' end
union all
select 'par défaut (nouvelles tables, séquences, fonctions) : rien pour anon',
       case when not exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
                             where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
                               and a.grantee = 'anon'::regrole) then 'OK' else 'PROBLÈME' end
union all
select 'par défaut (nouvelles tables) : authenticated sans TRUNCATE / TRIGGER / REFERENCES / MAINTAIN',
       case when not exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
                             where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
                               and d.defaclobjtype = 'r' and a.grantee = 'authenticated'::regrole
                               and a.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN')) then 'OK' else 'PROBLÈME' end
union all
select 'par défaut (nouvelles fonctions) : plus exécutables par tout le monde',
       case when exists (select 1 from pg_default_acl d where d.defaclrole = 'postgres'::regrole
                           and d.defaclnamespace = 0 and d.defaclobjtype = 'f')
             and not exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
                             where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0
                               and d.defaclobjtype = 'f' and a.grantee = 0) then 'OK' else 'PROBLÈME' end
union all
select 'inscription : le déclencheur qui crée le profil est toujours actif',
       case when exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and tgenabled <> 'D') then 'OK' else 'PROBLÈME' end;

/* =====================================================================
   RETOUR ARRIÈRE — remet EXACTEMENT les droits d'avant le script 33.
   (anon n'avait déjà plus la lecture des 4 tables de contenu depuis le
   script 31, ni la modification de profiles ; exam_attempt_pages n'avait
   aucun droit.) Sélectionner de « begin; » à « commit; » puis Run.

begin;
grant all on all tables in schema public to anon;
revoke select on public.assignment_questions, public.exam_sections,
                 public.question_groups, public.questions from anon;
revoke update on public.profiles from anon;
revoke all on public.exam_attempt_pages from anon;
grant all on all sequences in schema public to anon;

grant truncate, trigger, references, maintain on all tables in schema public to authenticated;
revoke all on public.exam_attempt_pages from authenticated;

grant execute on function public.exam_live_content_guard()  to public, anon;
grant execute on function public.exam_paper_release_guard() to public, anon;
grant execute on function public.submissions_guard()        to public, anon;

alter default privileges for role postgres in schema public grant all on tables to anon;
alter default privileges for role postgres in schema public grant truncate, trigger, references, maintain on tables to authenticated;
alter default privileges for role postgres in schema public grant all on sequences to anon;
alter default privileges for role postgres in schema public grant execute on functions to anon;
alter default privileges for role postgres grant execute on functions to public;
commit;
   ===================================================================== */
