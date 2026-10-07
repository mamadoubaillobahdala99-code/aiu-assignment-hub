-- =====================================================================
-- 51_task_feedback.sql — livraison 89 : un commentaire par tâche (Writing)
-- =====================================================================
-- Ce que fait ce script :
--   1. Ajoute à writing_grades (la correction d'UNE tâche : Task 1 ou
--      Task 2) une colonne task_feedback : le commentaire du prof pour
--      cette tâche (5 000 caractères au plus). Le commentaire général
--      (assignment_feedback.feedback) ne change pas.
-- Ce qu'il ne fait PAS : aucune règle RLS changée, aucun droit changé,
-- aucune fonction changée, aucune donnée existante touchée (la colonne est
-- vide au départ). Les règles existantes s'appliquent telles quelles :
-- l'élève ne lit la correction (et donc ce commentaire) qu'APRÈS la
-- publication ; seuls les profs de la classe (ou de l'examen) l'écrivent.
-- Sécurité : UNE transaction ; garde-fou au début ; 4 vérifications à la
-- fin ; si une seule échoue, rien n'est changé. Ré-exécutable sans risque.
-- Retour arrière : en bas du fichier, dans le bloc /* … */.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0. Garde-fou : les règles de sécurité doivent être celles d'aujourd'hui.
-- ---------------------------------------------------------------------
do $guard$
declare v text;
begin
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'  into v;
  if v is distinct from '65c8a9cc3b90733a70e8768f6a232aa4' then
    raise exception 'Les regles de securite ne sont pas celles attendues (empreinte %). Rien n''est change.', v;
  end if;
  if to_regclass('public.writing_grades') is null then
    raise exception 'Table writing_grades introuvable. Rien n''est change.';
  end if;
  select data_type into v from information_schema.columns
   where table_schema = 'public' and table_name = 'writing_grades' and column_name = 'task_feedback';
  if v is not null and v <> 'text' then
    raise exception 'writing_grades.task_feedback existe deja avec un autre type (%). Rien n''est change.', v;
  end if;
end $guard$;

-- ---------------------------------------------------------------------
-- 1. La colonne et sa limite de taille.
-- ---------------------------------------------------------------------
alter table public.writing_grades add column if not exists task_feedback text;

alter table public.writing_grades drop constraint if exists writing_grades_task_feedback_size;
alter table public.writing_grades add constraint writing_grades_task_feedback_size
  check (task_feedback is null or length(task_feedback) <= 5000);

comment on column public.writing_grades.task_feedback is
  'Commentaire du prof pour CETTE tache (Task 1 ou Task 2). Lu par l''eleve seulement apres publication (regles existantes). Livraison 89.';

-- ---------------------------------------------------------------------
-- 2. Vérifications. Si une seule échoue : tout est annulé.
-- ---------------------------------------------------------------------
do $check$
declare v text; n int;
begin
  -- V1 : la colonne et sa limite sont là.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'writing_grades' and column_name = 'task_feedback'
     and data_type = 'text' and is_nullable = 'YES' and column_default is null;
  if n <> 1 then raise exception 'V1 : colonne task_feedback inattendue.'; end if;
  select count(*) into n from pg_constraint
   where conrelid = 'public.writing_grades'::regclass and conname = 'writing_grades_task_feedback_size' and contype = 'c';
  if n <> 1 then raise exception 'V1 : limite de taille absente.'; end if;

  -- V2 : règles RLS strictement inchangées ; RLS partout.
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'  into v;
  if v is distinct from '65c8a9cc3b90733a70e8768f6a232aa4' then raise exception 'V2 : les regles ont change (%).', v; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception 'V2 : % table(s) sans RLS.', n; end if;

  -- V3 : droits sur writing_grades inchangés : authenticated (lire, écrire
  -- sous les règles), anon rien ; et anon n'a rien nulle part.
  select string_agg(privilege_type, ',' order by privilege_type) into v
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'writing_grades' and grantee = 'authenticated';
  if v is distinct from 'DELETE,INSERT,SELECT,UPDATE' then raise exception 'V3 : droits inattendus sur writing_grades (%).', v; end if;
  select count(*) into n from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon';
  if n <> 0 then raise exception 'V3 : anon a % droit(s) sur des tables.', n; end if;

  -- V4 : aucune fonction accessible à anon.
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  if n <> 0 then raise exception 'V4 : anon peut lancer % fonction(s).', n; end if;

  raise notice '51 OK : colonne en place, 4 verifications passees.';
end $check$;

commit;

-- Message final : « 51 OK » seulement si la colonne est bien en place.
select case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'writing_grades' and column_name = 'task_feedback')
            then '51 OK — 4 vérifications passées'
            else 'ÉCHEC — le 51 n''est pas en place (voir le message rouge plus haut)' end as resultat;


/* =====================================================================
   RETOUR ARRIÈRE (seulement pour revenir exactement à avant le 51)
   ATTENTION : les commentaires par tâche déjà écrits seront effacés.
   Copier depuis la ligne « -- DÉBUT » jusqu'à la ligne « -- FIN » dans
   l'éditeur SQL de Supabase, puis Run.
   =====================================================================
-- DÉBUT
begin;

alter table public.writing_grades drop constraint if exists writing_grades_task_feedback_size;
alter table public.writing_grades drop column if exists task_feedback;

commit;
select case when not exists (select 1 from information_schema.columns
                              where table_schema = 'public' and table_name = 'writing_grades' and column_name = 'task_feedback')
            then 'Retour arrière du 51 : OK' else 'ÉCHEC du retour arrière' end as resultat;
-- FIN
*/
