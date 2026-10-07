-- =====================================================================
-- 51_test_annule.sql — livraison 89 : TEST du script 51, puis TOUT est annulé
-- =====================================================================
-- À lancer AVANT 51_task_feedback.sql, dans l'éditeur SQL de Supabase
-- (« Run without RLS » si on te le demande : c'est seulement l'éditeur).
-- Dans UNE transaction annulée à la fin :
--   1. crée une classe et un devoir Writing (Task 1 + Task 2) de TEST, avec
--      des comptes qui existent déjà (2 profs, 3 élèves) — rien n'est gardé ;
--   2. 2 essais AVANT le script 51 ;
--   3. le script 51 lui-même (avec ses 4 vérifications) ;
--   4. 11 essais APRÈS (à la place de ces comptes : qui peut écrire / lire
--      le commentaire d'une tâche, avant et après la publication).
-- Résultat attendu : un message rouge « ERROR: RESULTATS : 14 OK / 0 KO »
-- (voulu : il annule tout). La base n'est pas modifiée.
-- =====================================================================
begin;

create temp table res (n serial, step text, got text, expected text);
grant all on res to authenticated, anon;
grant usage on sequence res_n_seq to authenticated, anon;
create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated, anon;

-- Le testeur : lance l'appel à la place d'un compte, puis (au besoin) lit le
-- résultat dans la base, puis ANNULE tout ce que l'essai a fait.
create or replace function pg_temp.t(p_step text, p_who text, p_sql text, p_check text, p_expected text) returns void
language plpgsql as $t$
declare v_uid uuid; v1 text; v2 text; v_got text;
begin
  select v into v_uid from ids where k = p_who;
  begin
    if p_who = 'ANON' then
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      set local role anon;
    else
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      set local role authenticated;
    end if;
    execute p_sql into v1;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if p_check is not null then execute p_check into v2; end if;
    v_got := 'OK ' || coalesce(v1, 'null') || coalesce(' | ' || v2, '');
    raise exception using errcode = 'P0001', message = '__annule__';
  exception when others then
    if sqlerrm <> '__annule__' then v_got := 'ERR'; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into res (step, got, expected) values (p_step, v_got, p_expected);
end $t$;

-- ---------------------------------------------------------------------
-- 1. Données de test (comptes existants ; classe et devoir créés ici).
--    S_IN : copie pas encore publiée ; S_IN2 : copie publiée.
-- ---------------------------------------------------------------------
do $setup$
declare
  t uuid; t2 uuid; s_in uuid; s_in2 uuid; s_out uuid; c1 uuid; w uuid; sec1 uuid; sec2 uuid;
begin
  select id into t  from public.profiles where role = 'teacher' order by created_at, id limit 1;
  select id into t2 from public.profiles where role = 'teacher' and id <> t order by created_at, id limit 1;
  select id into s_in  from public.profiles where role = 'student' order by created_at, id limit 1;
  select id into s_in2 from public.profiles where role = 'student' and id <> s_in order by created_at, id limit 1;
  select id into s_out from public.profiles where role = 'student' and id not in (s_in, s_in2) order by created_at, id limit 1;
  if t is null or t2 is null or s_in is null or s_in2 is null or s_out is null then
    raise exception 'Test impossible : il faut au moins 2 profs et 3 eleves dans la base.';
  end if;
  insert into public.classes (name, code, teacher_id, kind)
    values ('TEST 51 classe', 'T51' || substr(md5(random()::text), 1, 5), t, 'class') returning id into c1;
  insert into public.roster (class_id, student_id) values (c1, s_in), (c1, s_in2);
  insert into public.assignments (class_id, title, type) values (c1, 'TEST 51 writing', 'Writing') returning id into w;
  insert into public.exam_sections (assignment_id, title, order_index, task_number, passage_text) values (w, 'Task 1', 0, 1, 'T1') returning id into sec1;
  insert into public.exam_sections (assignment_id, title, order_index, task_number, passage_text) values (w, 'Task 2', 1, 2, 'T2') returning id into sec2;
  insert into public.writing_responses (assignment_id, section_id, student_id, content_html, word_count, submitted_at) values
    (w, sec1, s_in, '<p>a</p>', 1, now()), (w, sec2, s_in, '<p>b</p>', 1, now()),
    (w, sec1, s_in2, '<p>c</p>', 1, now()), (w, sec2, s_in2, '<p>d</p>', 1, now());
  insert into public.writing_grades (assignment_id, section_id, student_id, corrected_html, task_band) values
    (w, sec1, s_in, '<p>a</p>', 6), (w, sec1, s_in2, '<p>c</p>', 7);
  insert into public.assignment_feedback (assignment_id, student_id, band, feedback, released_at) values
    (w, s_in2, '7', 'General', now());
  insert into ids values ('T', t), ('T2', t2), ('S_IN', s_in), ('S_IN2', s_in2), ('S_OUT', s_out),
                         ('W', w), ('SEC1', sec1), ('SEC2', sec2), ('ANON', null);
end $setup$;

-- 2. Les 2 essais AVANT le script 51.
select pg_temp.t('AVANT A1 prof de la classe : la colonne n''existe pas encore', 'T', 'select count(task_feedback)::text from public.writing_grades where assignment_id = ''' || (select v::text from ids where k='W') || '''', null, 'ERR');
select pg_temp.t('AVANT A2 prof de la classe : les corrections existantes se lisent', 'T', 'select count(*)::text from public.writing_grades where assignment_id = ''' || (select v::text from ids where k='W') || '''', null, 'OK 2');

-- 3. Le script 51 lui-même (avec ses 4 vérifications). S'il échoue, tout s'arrête.
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
insert into res (step, got, expected) values ('Script 51 appliqué, 4 vérifications passées', 'OK', 'OK');
-- Les commentaires de départ (comme si le prof les avait écrits).
update public.writing_grades set task_feedback = 'Secret T1 eleve 1' where assignment_id = (select v from ids where k='W') and student_id = (select v from ids where k='S_IN');
update public.writing_grades set task_feedback = 'Bon plan T1' where assignment_id = (select v from ids where k='W') and student_id = (select v from ids where k='S_IN2');

-- 4. Les 11 essais APRÈS le script 51.
select pg_temp.t('APRES P1 prof de la classe : écrit le commentaire de la Task 1', 'T', 'with u as (update public.writing_grades set task_feedback = ''Nouveau'' where section_id = ''' || (select v::text from ids where k='SEC1') || ''' and student_id = ''' || (select v::text from ids where k='S_IN') || ''' returning 1) select count(*)::text from u', 'select task_feedback from public.writing_grades where section_id = ''' || (select v::text from ids where k='SEC1') || ''' and student_id = ''' || (select v::text from ids where k='S_IN') || '''', 'OK 1 | Nouveau');
select pg_temp.t('APRES P2 prof de la classe : crée la correction de la Task 2 avec son commentaire', 'T', 'with i as (insert into public.writing_grades (assignment_id, section_id, student_id, corrected_html, task_feedback) values (''' || (select v::text from ids where k='W') || ''', ''' || (select v::text from ids where k='SEC2') || ''', ''' || (select v::text from ids where k='S_IN') || ''', ''<p>b</p>'', ''T2 ok'') returning 1) select count(*)::text from i', null, 'OK 1');
select pg_temp.t('APRES P3 prof de la classe : relit les deux commentaires', 'T', 'select string_agg(coalesce(task_feedback, ''-''), '','' order by task_feedback) from public.writing_grades where assignment_id = ''' || (select v::text from ids where k='W') || '''', null, 'OK Bon plan T1,Secret T1 eleve 1');
select pg_temp.t('APRES P4 autre prof : ne voit rien', 'T2', 'select count(*)::text from public.writing_grades where assignment_id = ''' || (select v::text from ids where k='W') || '''', null, 'OK 0');
select pg_temp.t('APRES P5 autre prof : ne peut rien changer', 'T2', 'with u as (update public.writing_grades set task_feedback = ''X'' where assignment_id = ''' || (select v::text from ids where k='W') || ''' returning 1) select count(*)::text from u', null, 'OK 0');
select pg_temp.t('APRES P6 élève, copie PAS publiée : ne voit pas le commentaire', 'S_IN', 'select count(*)::text from public.writing_grades where assignment_id = ''' || (select v::text from ids where k='W') || '''', null, 'OK 0');
select pg_temp.t('APRES P7 élève, copie publiée : lit SON commentaire de la Task 1', 'S_IN2', 'select string_agg(task_feedback, '','') from public.writing_grades where assignment_id = ''' || (select v::text from ids where k='W') || '''', null, 'OK Bon plan T1');
select pg_temp.t('APRES P8 élève : ne peut pas modifier son commentaire', 'S_IN2', 'with u as (update public.writing_grades set task_feedback = ''X'' where assignment_id = ''' || (select v::text from ids where k='W') || ''' returning 1) select count(*)::text from u', null, 'OK 0');
select pg_temp.t('APRES P9 élève hors classe : ne voit rien', 'S_OUT', 'select count(*)::text from public.writing_grades where assignment_id = ''' || (select v::text from ids where k='W') || '''', null, 'OK 0');
select pg_temp.t('APRES P10 sans compte (anon) : refusé', 'ANON', 'select count(task_feedback)::text from public.writing_grades', null, 'ERR');
select pg_temp.t('APRES P11 commentaire de plus de 5 000 caractères : refusé', 'T', 'with u as (update public.writing_grades set task_feedback = repeat(''a'', 5001) where section_id = ''' || (select v::text from ids where k='SEC1') || ''' and student_id = ''' || (select v::text from ids where k='S_IN') || ''' returning 1) select count(*)::text from u', null, 'ERR');

-- Le résumé : un message rouge « ERROR » — c'est voulu, ça annule tout.
do $res$
declare ok int; ko int; kos text;
begin
  select count(*) filter (where got = expected), count(*) filter (where got is distinct from expected),
         string_agg(case when got is distinct from expected then step || ' : ' || coalesce(got, '∅') || ' (attendu ' || expected || ')' end, ' ; ' order by n)
    into ok, ko, kos from res;
  raise exception 'RESULTATS : % OK / % KO%', ok, ko, case when ko > 0 then ' | A REGARDER : ' || kos else '' end;
end $res$;

rollback;
