-- =====================================================================
-- 53_access_rules.sql — livraison 96 : 4 règles d'accès RESSERRÉES
-- =====================================================================
--   B4  Questions d'une épreuve : un prof ne peut plus brancher ses
--       questions dans l'épreuve d'une classe qui n'est pas la sienne
--       (ni lire / enlever ces branchements). Règle RESSERRÉE.
--   B9  Écoutes Listening limitées : la base vérifie que l'élève est
--       inscrit dans la classe, que la partie est bien dans l'épreuve, et
--       prend le nombre d'écoutes permis dans la partie elle-même (plus
--       celui envoyé par la page).
--   B10 Fichiers : seuls les PROFS déposent des fichiers, et seulement
--       dans leurs propres dossiers (images / audio / speaking). Un élève
--       ne peut plus déposer de fichier. Règle RESSERRÉE. Les fichiers
--       déjà là ne bougent pas et restent lisibles comme avant.
--   Surlignages (Reading) : chaque sauvegarde AJOUTAIT une ligne au lieu
--       de remplacer l'ancienne. Ce script supprime les lignes en double
--       (garde la plus récente), puis la base remplace au lieu d'ajouter ;
--       l'heure de sauvegarde est celle de la base.
-- Ce qu'il ne fait PAS : aucune table ni colonne ajoutée, aucun droit sur
-- les tables changé, aucune règle élargie. Seules données touchées : les
-- lignes de surlignage en double (les anciennes copies).
-- Fonctions : record_audio_play reste pour authenticated seulement ; la
-- nouvelle fonction (heure des surlignages) ne peut être lancée par personne.
-- Sécurité : UNE transaction ; garde-fou au début ; 5 vérifications à la
-- fin ; si une seule échoue, rien n'est changé. Ré-exécutable sans risque.
-- À lancer APRÈS le 52. Retour arrière : en bas, dans le bloc /* … */.
-- =====================================================================
begin;

-- Si une table est occupée plus de 5 secondes, le script s'arrête (rien
-- n'est changé ; il suffit de le relancer) au lieu de faire attendre le site.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------
-- 0. Garde-fou : la base doit être celle d'après le 52 (ou déjà passée
--    par ce script). Sinon : arrêt, rien n'est changé.
-- ---------------------------------------------------------------------
do $guard$
declare v text;
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Postgres 15 ou plus est necessaire (version %). Rien n''est change.', current_setting('server_version');
  end if;
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' into v;
  if v is distinct from 'd31e197f84969940d61f90281846a12e' and v is distinct from '2416d9df54200299e6dabe03a284a522' then
    raise exception 'Les regles de securite ne sont pas celles attendues (empreinte %). Rien n''est change.', v;
  end if;
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'storage' and c.relname = 'objects' into v;
  if v is distinct from 'a2d6d353a447b7006f1b0640a58c1bc9' and v is distinct from '0c74cfd9beeae4fa2ce612d7b0b04a5d' then
    raise exception 'Les regles des fichiers ne sont pas celles attendues (empreinte %). Rien n''est change.', v;
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.record_audio_play(uuid,uuid,integer)'));
  if v is distinct from '43e7e5d16dfb2da777f3467b85f522b8' and v is distinct from '401fff7c8019578070629efaa4f40aba' then
    raise exception 'record_audio_play n''est pas la version attendue (%). Rien n''est change.', v;
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.reading_highlights_touch()'));
  if v is not null and v is distinct from '175f7f90f1136aa4dbfd3db384dd07f2' then
    raise exception 'reading_highlights_touch existe deja dans une autre version (%). Rien n''est change.', v;
  end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.is_teacher()')) is distinct from 'e46667c14e363e1f15fc068cbcb4ac3f'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.is_class_teacher(uuid)')) is distinct from '2e3785c27e96e81cde28fa2eace662a4' then
    raise exception 'is_teacher / is_class_teacher ne sont pas ceux attendus. Rien n''est change.';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.reading_highlights'::regclass and conname = 'reading_highlights_scope_key' and contype = 'u'
                    and pg_get_constraintdef(oid) like '%(assignment_id, student_id, scope_type, section_id, question_id, option_key)') then
    raise exception 'La cle des surlignages n''est pas celle attendue. Rien n''est change.';
  end if;
end $guard$;

-- ---------------------------------------------------------------------
-- 1. B4 : brancher une question dans une épreuve = être prof de la classe
--    de cette épreuve (le propriétaire de la classe, ou l'équipe de
--    l'examen). La condition d'avant (la question est à soi) reste.
-- ---------------------------------------------------------------------
alter policy "teacher manages own assignment_questions" on public.assignment_questions
  using (
    exists (select 1 from public.questions q
             where q.id = assignment_questions.question_id and q.teacher_id = (select auth.uid()))
    and exists (select 1 from public.exam_sections s join public.assignments a on a.id = s.assignment_id
                 where s.id = assignment_questions.section_id and public.is_class_teacher(a.class_id))
  )
  with check (
    exists (select 1 from public.questions q
             where q.id = assignment_questions.question_id and q.teacher_id = (select auth.uid()))
    and exists (select 1 from public.exam_sections s join public.assignments a on a.id = s.assignment_id
                 where s.id = assignment_questions.section_id and public.is_class_teacher(a.class_id))
  );

-- ---------------------------------------------------------------------
-- 2. B9 : record_audio_play (écoutes Listening limitées).
-- ---------------------------------------------------------------------
create or replace function public.record_audio_play(p_assignment_id uuid, p_section_id uuid, p_max_plays integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
-- Livraison 96 (B9) : la base compte les écoutes d'une partie Listening
-- limitée. Le nombre d'écoutes permis vient de la partie elle-même
-- (exam_sections.max_plays), plus de la page : p_max_plays est ignoré
-- (gardé pour que la page actuelle marche sans changement).
-- Il faut être inscrit dans la classe de l'épreuve, et la partie doit
-- appartenir à cette épreuve.
declare
  v_student_id uuid := auth.uid();
  v_class_id uuid;
  v_max integer;
  v_current integer;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select a.class_id, s.max_plays into v_class_id, v_max
    from exam_sections s
    join assignments a on a.id = s.assignment_id
   where s.id = p_section_id and s.assignment_id = p_assignment_id;
  if not found then
    raise exception 'This part is not in this assignment';
  end if;

  if not exists (select 1 from roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  insert into listening_plays (assignment_id, student_id, section_id, plays_used)
  values (p_assignment_id, v_student_id, p_section_id, 0)
  on conflict (assignment_id, student_id, section_id) do nothing;

  select plays_used into v_current
  from listening_plays
  where assignment_id = p_assignment_id and student_id = v_student_id and section_id = p_section_id
  for update;

  if v_max is not null and v_current >= v_max then
    return jsonb_build_object('allowed', false, 'plays_used', v_current);
  end if;

  update listening_plays
  set plays_used = plays_used + 1
  where assignment_id = p_assignment_id and student_id = v_student_id and section_id = p_section_id
  returning plays_used into v_current;

  return jsonb_build_object('allowed', true, 'plays_used', v_current);
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. B10 : dépôt de fichiers = un prof, dans ses propres dossiers.
--    (La partie « dossier d'une classe » est retirée : le site ne s'en sert
--    plus, et elle laissait un élève déposer des fichiers.)
-- ---------------------------------------------------------------------
drop policy if exists "uploads limited to own folders" on storage.objects;
create policy "uploads limited to own folders"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assignment-files'
    and (storage.foldername(name))[1] in ('images', 'audio', 'speaking')
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.is_teacher()
  );

-- ---------------------------------------------------------------------
-- 4. Surlignages : 4a. supprimer les copies en double (garder la plus
--    récente) ; 4b. la clé compte les cases vides comme égales, pour que
--    la sauvegarde REMPLACE ; 4c. l'heure de sauvegarde vient de la base.
-- ---------------------------------------------------------------------
lock table public.reading_highlights in share row exclusive mode;

do $dedupe$
declare n int;
begin
  delete from public.reading_highlights h
   using (select id, row_number() over (partition by assignment_id, student_id, scope_type, section_id, question_id, option_key
                                        order by updated_at desc nulls last, id desc) rn
            from public.reading_highlights) d
   where d.id = h.id and d.rn > 1;
  get diagnostics n = row_count;
  raise notice 'Surlignages : % copie(s) en double supprimee(s).', n;
end $dedupe$;

alter table public.reading_highlights
  drop constraint reading_highlights_scope_key,
  add constraint reading_highlights_scope_key unique nulls not distinct (assignment_id, student_id, scope_type, section_id, question_id, option_key);

create or replace function public.reading_highlights_touch()
returns trigger
language plpgsql
set search_path = public
as $function$
-- Livraison 96 : l'heure d'une sauvegarde de surlignage est celle de la
-- base, pas celle de l'ordinateur de l'élève.
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.reading_highlights_touch() from public, anon, authenticated;
drop trigger if exists reading_highlights_touch on public.reading_highlights;
create trigger reading_highlights_touch before insert or update on public.reading_highlights
  for each row execute function public.reading_highlights_touch();

-- ---------------------------------------------------------------------
-- 5. Vérifications. Si une seule échoue : tout est annulé.
-- ---------------------------------------------------------------------
do $check$
declare v text; n int;
begin
  -- V1 : règles RLS = celles d'avant + la condition B4 ; fichiers = B10 ;
  -- RLS partout ; droits sur les tables inchangés ; rien pour anon.
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' into v;
  if v is distinct from '2416d9df54200299e6dabe03a284a522' then raise exception 'V1 : les regles ne sont pas celles prevues (%).', v; end if;
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'storage' and c.relname = 'objects' into v;
  if v is distinct from '0c74cfd9beeae4fa2ce612d7b0b04a5d' then raise exception 'V1 : les regles des fichiers ne sont pas celles prevues (%).', v; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception 'V1 : % table(s) sans RLS.', n; end if;
  if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'V1 : storage.objects sans RLS.';
  end if;
  select md5(string_agg(x, ' ' order by x collate "C")) from (select grantee||':'||table_name||':'||privilege_type x from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')) g into v;
  if v is distinct from '7285f854f83fe8df322356f91ce0fdb1' then raise exception 'V1 : les droits sur les tables ont change (%).', v; end if;
  select count(*) into n from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon';
  if n <> 0 then raise exception 'V1 : anon a % droit(s) sur des tables.', n; end if;

  -- V2 : record_audio_play est la version prévue, protégée,
  -- authenticated seulement.
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.record_audio_play(uuid,uuid,integer)')) is distinct from '401fff7c8019578070629efaa4f40aba' then raise exception 'V2 : record_audio_play n''est pas la version prevue.'; end if;
  select count(*) into n from pg_proc p
   where p.oid = 'public.record_audio_play(uuid,uuid,integer)'::regprocedure
     and p.prosecdef and array_to_string(p.proconfig, ',') = 'search_path=public'
     and has_function_privilege('authenticated', p.oid, 'execute')
     and not has_function_privilege('anon', p.oid, 'execute');
  if n <> 1 then raise exception 'V2 : securite ou droits de record_audio_play inattendus.'; end if;

  -- V3 : la fonction des surlignages : la bonne, lancée par personne ;
  -- anon ne lance aucune fonction.
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.reading_highlights_touch()')) is distinct from '175f7f90f1136aa4dbfd3db384dd07f2' then raise exception 'V3 : reading_highlights_touch n''est pas la version prevue.'; end if;
  if has_function_privilege('authenticated', 'public.reading_highlights_touch()'::regprocedure, 'execute')
     or has_function_privilege('anon', 'public.reading_highlights_touch()'::regprocedure, 'execute') then
    raise exception 'V3 : la fonction des surlignages peut etre lancee.';
  end if;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  if n <> 0 then raise exception 'V3 : anon peut lancer % fonction(s).', n; end if;

  -- V4 : surlignages : plus aucun double, la clé compte les cases vides
  -- comme égales, le déclencheur est branché et actif.
  if (select count(*) from (select 1 from public.reading_highlights group by assignment_id, student_id, scope_type, section_id, question_id, option_key having count(*) > 1) d) <> 0 then raise exception 'V4 : il reste des surlignages en double.'; end if;
  if (select i.indnullsnotdistinct from pg_constraint k join pg_index i on i.indexrelid = k.conindid where k.conrelid = 'public.reading_highlights'::regclass and k.conname = 'reading_highlights_scope_key' and k.contype = 'u') is not true then raise exception 'V4 : la cle des surlignages n''est pas celle prevue.'; end if;
  select count(*) into n from pg_trigger
   where tgrelid = 'public.reading_highlights'::regclass and tgname = 'reading_highlights_touch'
     and tgfoid = 'public.reading_highlights_touch()'::regprocedure and tgenabled = 'O';
  if n <> 1 then raise exception 'V4 : le declencheur des surlignages n''est pas en place.'; end if;

  -- V5 : la règle B4 contient bien la nouvelle condition (lecture ET écriture).
  select count(*) into n from pg_policy
   where polrelid = 'public.assignment_questions'::regclass
     and polname = 'teacher manages own assignment_questions'
     and pg_get_expr(polqual, polrelid) like '%is_class_teacher(a.class_id)%'
     and pg_get_expr(polwithcheck, polrelid) like '%is_class_teacher(a.class_id)%';
  if n <> 1 then raise exception 'V5 : la regle B4 n''est pas celle prevue.'; end if;

  raise notice '53 OK : 2 regles resserrees + 1 fonction + surlignages, 5 verifications passees.';
end $check$;

commit;

-- Message final : « 53 OK » seulement si tout est bien en place.
select case when (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.record_audio_play(uuid,uuid,integer)')) = '401fff7c8019578070629efaa4f40aba' and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.reading_highlights_touch()')) = '175f7f90f1136aa4dbfd3db384dd07f2' and (select i.indnullsnotdistinct from pg_constraint k join pg_index i on i.indexrelid = k.conindid where k.conrelid = 'public.reading_highlights'::regclass and k.conname = 'reading_highlights_scope_key' and k.contype = 'u') is true and (select count(*) from (select 1 from public.reading_highlights group by assignment_id, student_id, scope_type, section_id, question_id, option_key having count(*) > 1) d) = 0 and exists (select 1 from pg_trigger where tgrelid = 'public.reading_highlights'::regclass and tgname = 'reading_highlights_touch' and tgenabled = 'O') and (select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public') = '2416d9df54200299e6dabe03a284a522' and (select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'storage' and c.relname = 'objects') = '0c74cfd9beeae4fa2ce612d7b0b04a5d'
            then '53 OK — 5 vérifications passées'
            else 'ÉCHEC — le 53 n''est pas en place (voir le message rouge plus haut)' end as resultat;


/* =====================================================================
   RETOUR ARRIÈRE (seulement pour revenir exactement à après le 52)
   Copier depuis la ligne « -- DÉBUT » jusqu'à la ligne « -- FIN » dans
   l'éditeur SQL de Supabase, puis Run.
   (Les surlignages en double supprimés ne reviennent pas : c'étaient
   d'anciennes copies inutiles.)
   =====================================================================
-- DÉBUT
begin;

alter policy "teacher manages own assignment_questions" on public.assignment_questions
  using (exists (select 1 from public.questions q
                  where q.id = assignment_questions.question_id and q.teacher_id = (select auth.uid())))
  with check (exists (select 1 from public.questions q
                       where q.id = assignment_questions.question_id and q.teacher_id = (select auth.uid())));

CREATE OR REPLACE FUNCTION public.record_audio_play(p_assignment_id uuid, p_section_id uuid, p_max_plays integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id uuid := auth.uid();
  v_current integer;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into listening_plays (assignment_id, student_id, section_id, plays_used)
  values (p_assignment_id, v_student_id, p_section_id, 0)
  on conflict (assignment_id, student_id, section_id) do nothing;

  select plays_used into v_current
  from listening_plays
  where assignment_id = p_assignment_id and student_id = v_student_id and section_id = p_section_id
  for update;

  if p_max_plays is not null and v_current >= p_max_plays then
    return jsonb_build_object('allowed', false, 'plays_used', v_current);
  end if;

  update listening_plays
  set plays_used = plays_used + 1
  where assignment_id = p_assignment_id and student_id = v_student_id and section_id = p_section_id
  returning plays_used into v_current;

  return jsonb_build_object('allowed', true, 'plays_used', v_current);
end;
$function$;

drop policy if exists "uploads limited to own folders" on storage.objects;
create policy "uploads limited to own folders"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assignment-files' and (
      ( (storage.foldername(name))[1] in ('images', 'audio', 'speaking')
        and (storage.foldername(name))[2] = auth.uid()::text )
      or public.can_write_class_file((storage.foldername(name))[1])
    )
  );

drop trigger if exists reading_highlights_touch on public.reading_highlights;
drop function if exists public.reading_highlights_touch();
alter table public.reading_highlights
  drop constraint reading_highlights_scope_key,
  add constraint reading_highlights_scope_key unique (assignment_id, student_id, scope_type, section_id, question_id, option_key);

do $check$
declare v text;
begin
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.record_audio_play(uuid,uuid,integer)')) is distinct from '43e7e5d16dfb2da777f3467b85f522b8' then
    raise exception 'Retour arriere : record_audio_play inattendue. Rien n''est change.';
  end if;
  if to_regprocedure('public.reading_highlights_touch()') is not null then
    raise exception 'Retour arriere : la fonction des surlignages est encore la.';
  end if;
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' into v;
  if v is distinct from 'd31e197f84969940d61f90281846a12e' then raise exception 'Retour arriere : regles inattendues (%).', v; end if;
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'storage' and c.relname = 'objects' into v;
  if v is distinct from 'a2d6d353a447b7006f1b0640a58c1bc9' then raise exception 'Retour arriere : regles des fichiers inattendues (%).', v; end if;
  if (select i.indnullsnotdistinct from pg_constraint k join pg_index i on i.indexrelid = k.conindid where k.conrelid = 'public.reading_highlights'::regclass and k.conname = 'reading_highlights_scope_key' and k.contype = 'u') is not false then raise exception 'Retour arriere : cle des surlignages inattendue.'; end if;
end $check$;

commit;
select case when (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.record_audio_play(uuid,uuid,integer)')) = '43e7e5d16dfb2da777f3467b85f522b8' and to_regprocedure('public.reading_highlights_touch()') is null
            then 'Retour arrière du 53 : OK' else 'ÉCHEC du retour arrière' end as resultat;
-- FIN
*/
