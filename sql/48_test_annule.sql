-- =====================================================================
-- 48_test_annule.sql — livraison 86 : TEST du script 48, puis TOUT est annulé
-- =====================================================================
-- À lancer AVANT 48_cleanup_feedback.sql, dans l'éditeur SQL de Supabase
-- (« Run without RLS » si on te le demande : c'est seulement l'éditeur).
-- Ce que fait ce fichier, dans UNE transaction annulée à la fin (rollback) :
--   1. crée une classe, un devoir, un examen de TEST (avec des comptes qui
--      existent déjà : 2 profs, 3 élèves) — rien n'est gardé ;
--   2. essaie 16 actions en se mettant à la place de ces comptes (prof de la
--      classe, autre prof, élève, prof créateur et prof invité de l'examen)
--      AVANT le script 48 ;
--   3. applique le script 48 (avec ses 5 vérifications) ;
--   4. refait les 16 essais APRÈS ;
--   5. vérifie : la table submissions et les 2 fonctions ont disparu.
-- Résultat attendu : un message rouge « ERROR: RESULTATS : 37 OK / 0 KO » (voulu : il annule tout)
-- Seuls 4 essais doivent changer : ceux où un prof donne une note à un compte
-- qui n'est PAS inscrit (P2, P3, P12, P14) → refusés après le 48.
-- La base n'est pas modifiée : tout est annulé (rollback) à la fin.
-- =====================================================================
begin;

create temp table res (n serial, step text, got text, expected text);
grant all on res to authenticated;
grant usage on sequence res_n_seq to authenticated;
create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated;

-- Le testeur : se met à la place d'un compte, lance UNE instruction, note
-- le résultat, puis annule ce que l'instruction a fait (chaque essai part
-- du même état).
create or replace function pg_temp.t(p_step text, p_who text, p_sql text, p_expected text) returns void
language plpgsql as $t$
declare v_uid uuid; v_n bigint; v_got text;
begin
  select v into v_uid from ids where k = p_who;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    execute p_sql into v_n;
    v_got := 'OK ' || v_n;
    raise exception using errcode = 'P0001', message = '__annule__';
  exception when others then
    if sqlerrm <> '__annule__' then v_got := 'ERR'; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into res (step, got, expected) values (p_step, v_got, p_expected);
end $t$;

-- ---------------------------------------------------------------------
-- 1. Données de test (comptes existants, classe/devoir/examen créés ici).
-- ---------------------------------------------------------------------
do $setup$
declare
  t uuid; t2 uuid; s_in uuid; s_in2 uuid; s_out uuid;
  c1 uuid; c2 uuid; a1 uuid; a2 uuid; e uuid;
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
    values ('TEST 48 classe', 'T48' || substr(md5(random()::text), 1, 5), t, 'class') returning id into c1;
  insert into public.assignments (class_id, title, type) values (c1, 'TEST 48 devoir', 'Reading') returning id into a1;
  insert into public.roster (class_id, student_id) values (c1, s_in), (c1, s_in2);
  insert into public.assignment_feedback (assignment_id, student_id, band, released_at) values (a1, s_in, '5', now());

  insert into public.classes (name, code, teacher_id, kind)
    values ('TEST 48 examen', 'X48' || substr(md5(random()::text), 1, 5), t, 'exam') returning id into c2;
  insert into public.exam_sessions (name, code, container_class_id, created_by)
    values ('TEST 48 examen', 'E48' || substr(md5(random()::text), 1, 5), c2, t) returning id into e;
  insert into public.exam_session_staff (session_id, teacher_id, role) values (e, t, 'owner'), (e, t2, 'co');
  insert into public.assignments (class_id, title, type) values (c2, 'TEST 48 épreuve', 'Reading') returning id into a2;
  insert into public.exam_session_items (session_id, assignment_id, order_index) values (e, a2, 0);
  insert into public.roster (class_id, student_id) values (c2, s_in), (c2, s_in2);
  insert into public.assignment_feedback (assignment_id, student_id, band) values (a2, s_in, '5');

  insert into ids values ('T', t), ('T2', t2), ('T2X', t2), ('S_IN', s_in), ('S_IN2', s_in2), ('S_OUT', s_out),
                         ('A1', a1), ('A2', a2);
end $setup$;

-- ---------------------------------------------------------------------
-- 2. Les 16 essais AVANT le script 48.
-- ---------------------------------------------------------------------
select pg_temp.t('AVANT P1 prof de la classe : note pour un élève INSCRIT', 'T', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A1}'', ''{S_IN2}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('AVANT P2 prof de la classe : note pour un élève NON inscrit', 'T', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A1}'', ''{S_OUT}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('AVANT P3 prof de la classe : déplacer une note vers un élève NON inscrit', 'T', (select replace(replace(replace(replace(replace('with x as (update public.assignment_feedback set student_id = ''{S_OUT}'' where assignment_id = ''{A1}'' and student_id = ''{S_IN}'' returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('AVANT P4 prof de la classe : modifier la note d''un élève inscrit', 'T', (select replace(replace(replace(replace(replace('with x as (update public.assignment_feedback set band = ''7'', feedback = ''ok'' where assignment_id = ''{A1}'' and student_id = ''{S_IN}'' returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('AVANT P5 prof de la classe : lire les notes du devoir', 'T', (select replace(replace(replace(replace(replace('select count(*) from public.assignment_feedback where assignment_id = ''{A1}''', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('AVANT P6 prof de la classe : supprimer une note', 'T', (select replace(replace(replace(replace(replace('with x as (delete from public.assignment_feedback where assignment_id = ''{A1}'' and student_id = ''{S_IN}'' returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('AVANT P7 autre prof : note dans une classe qui n''est pas la sienne', 'T2', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A1}'', ''{S_IN2}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'ERR');
select pg_temp.t('AVANT P8 autre prof : lire les notes d''une classe qui n''est pas la sienne', 'T2', (select replace(replace(replace(replace(replace('select count(*) from public.assignment_feedback where assignment_id = ''{A1}''', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 0');
select pg_temp.t('AVANT P9 élève : écrire sa propre note', 'S_IN', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A1}'', ''{S_IN}'', ''9'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'ERR');
select pg_temp.t('AVANT P10 élève : lire sa note publiée', 'S_IN', (select replace(replace(replace(replace(replace('select count(*) from public.assignment_feedback where assignment_id = ''{A1}'' and student_id = ''{S_IN}''', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('AVANT P11 prof créateur de l''examen : note pour un candidat INSCRIT', 'T', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A2}'', ''{S_IN2}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('AVANT P12 prof créateur de l''examen : note pour un compte NON inscrit', 'T', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A2}'', ''{S_OUT}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('AVANT P13 prof invité de l''examen : note pour un candidat INSCRIT', 'T2X', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A2}'', ''{S_IN2}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('AVANT P14 prof invité de l''examen : note pour un compte NON inscrit', 'T2X', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A2}'', ''{S_OUT}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('AVANT P15 prof invité de l''examen : modifier la note d''un candidat', 'T2X', (select replace(replace(replace(replace(replace('with x as (update public.assignment_feedback set band = ''7'' where assignment_id = ''{A2}'' and student_id = ''{S_IN}'' returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('AVANT P16 prof invité de l''examen : lire les notes de l''examen', 'T2X', (select replace(replace(replace(replace(replace('select count(*) from public.assignment_feedback where assignment_id = ''{A2}''', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');

-- ---------------------------------------------------------------------
-- 3. Le script 48 lui-même (sections 0 à 3, avec ses 5 vérifications).
--    S'il échoue, tout s'arrête ici (et rien n'est gardé).
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- 0. Garde-fou : les règles de sécurité de public doivent être EXACTEMENT
--    celles d'aujourd'hui (62 règles, empreinte 5647f84a7b5033a85a96a1870c7a5722)
--    ou celles d'après ce script (58 règles, empreinte 65c8a9cc3b90733a70e8768f6a232aa4).
--    Et la table submissions, si elle existe encore, doit être vide.
--    Sinon : arrêt, rien n'est changé.
-- ---------------------------------------------------------------------
do $guard$
declare v text; n bigint;
begin
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' into v;
  if v is distinct from '5647f84a7b5033a85a96a1870c7a5722' and v is distinct from '65c8a9cc3b90733a70e8768f6a232aa4' then
    raise exception 'Les regles de securite ne sont pas celles attendues (empreinte %). Rien n''est change.', v;
  end if;
  if to_regclass('public.submissions') is not null then
    execute 'select count(*) from public.submissions' into n;
    if n > 0 then
      raise exception 'La table submissions contient % ligne(s) : on ne la supprime pas. Rien n''est change.', n;
    end if;
  end if;
end $guard$;

-- ---------------------------------------------------------------------
-- 1. L'ancien système de rendu.
--    (Sans « cascade » : si quelque chose d'inattendu en dépendait encore,
--    Postgres refuserait et rien ne serait changé.)
-- ---------------------------------------------------------------------
drop table if exists public.submissions;
drop function if exists public.submissions_guard();
drop function if exists public.submit_student_answer(uuid, uuid, jsonb);

-- ---------------------------------------------------------------------
-- 2. assignment_feedback : écrire une note seulement pour un élève inscrit
--    dans la classe du devoir. La 1re partie de chaque condition est la
--    règle d'aujourd'hui, mot pour mot ; on y ajoute « et l'élève est
--    inscrit ». (Les profs d'un examen voient déjà la liste des inscrits
--    de l'examen : is_class_teacher les compte.)
-- ---------------------------------------------------------------------
alter policy "teachers manage feedback in own class" on public.assignment_feedback
  with check ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = assignment_feedback.assignment_id) AND (c.teacher_id = (select auth.uid())))))
  AND (EXISTS ( SELECT 1
   FROM (assignments a2
     JOIN roster r ON ((r.class_id = a2.class_id)))
  WHERE ((a2.id = assignment_feedback.assignment_id) AND (r.student_id = assignment_feedback.student_id)))));

alter policy "exam staff mark feedback" on public.assignment_feedback
  with check ((is_exam_staff_of_assignment(assignment_id)
  AND (EXISTS ( SELECT 1
   FROM (assignments a2
     JOIN roster r ON ((r.class_id = a2.class_id)))
  WHERE ((a2.id = assignment_feedback.assignment_id) AND (r.student_id = assignment_feedback.student_id))))));

-- ---------------------------------------------------------------------
-- 3. Vérifications. Si une seule échoue : tout est annulé.
-- ---------------------------------------------------------------------
do $check$
declare v text; n int;
begin
  -- V1 : l'ancien système a disparu ; is_assignment_teacher est toujours là.
  if to_regclass('public.submissions') is not null
     or to_regprocedure('public.submissions_guard()') is not null
     or to_regprocedure('public.submit_student_answer(uuid,uuid,jsonb)') is not null then
    raise exception 'V1 : l''ancien systeme est encore la.';
  end if;
  if to_regprocedure('public.is_assignment_teacher(uuid)') is null
     or not exists (select 1 from pg_policies where schemaname='public' and tablename='listening_plays'
                    and policyname='teachers read play counts in own classes') then
    raise exception 'V1 : is_assignment_teacher ou la regle de listening_plays a disparu.';
  end if;

  -- V2 : 58 règles sur public (62 - les 4 de submissions).
  select count(*) into n from pg_policies where schemaname = 'public';
  if n <> 58 then raise exception 'V2 : % regles au lieu de 58.', n; end if;

  -- V3 : sur assignment_feedback, ce qu'on peut LIRE ne change pas ;
  --      ce qu'on peut ÉCRIRE demande maintenant l'inscription.
  select md5(string_agg(policyname||'|'||cmd||'|'||coalesce(qual,''), E'\n' order by policyname)) into v
    from pg_policies where schemaname='public' and tablename='assignment_feedback';
  if v is distinct from '49078eef8af51a6a3d5c9e4a4a56b26a' then
    raise exception 'V3 : les conditions de lecture de assignment_feedback ont change (%).', v;
  end if;
  select count(*) into n from pg_policies where schemaname='public' and tablename='assignment_feedback'
     and policyname in ('teachers manage feedback in own class','exam staff mark feedback')
     and with_check like '%JOIN roster r ON ((r.class_id = a2.class_id))%'
     and with_check like '%(r.student_id = assignment_feedback.student_id)%';
  if n <> 2 then raise exception 'V3 : la condition d''inscription manque (% regle(s) sur 2).', n; end if;

  -- V4 : toujours la RLS partout, et toujours rien pour anon.
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception 'V4 : % table(s) sans RLS.', n; end if;
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon';
  if n <> 0 then raise exception 'V4 : anon a % droit(s) sur des tables.', n; end if;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  if n <> 0 then raise exception 'V4 : anon peut lancer % fonction(s).', n; end if;

  -- V5 : l'empreinte complète des règles est exactement celle prévue.
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' into v;
  if v is distinct from '65c8a9cc3b90733a70e8768f6a232aa4' then
    raise exception 'V5 : empreinte des regles inattendue (%).', v;
  end if;

  raise notice '48 OK : ancien systeme supprime, feedback resserre, 5 verifications passees.';
end $check$;
insert into res (step, got, expected) values ('Script 48 appliqué, 5 vérifications passées', 'OK', 'OK');

-- ---------------------------------------------------------------------
-- 4. Les 16 essais APRÈS le script 48.
-- ---------------------------------------------------------------------
select pg_temp.t('APRES P1 prof de la classe : note pour un élève INSCRIT', 'T', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A1}'', ''{S_IN2}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('APRES P2 prof de la classe : note pour un élève NON inscrit', 'T', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A1}'', ''{S_OUT}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'ERR');
select pg_temp.t('APRES P3 prof de la classe : déplacer une note vers un élève NON inscrit', 'T', (select replace(replace(replace(replace(replace('with x as (update public.assignment_feedback set student_id = ''{S_OUT}'' where assignment_id = ''{A1}'' and student_id = ''{S_IN}'' returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'ERR');
select pg_temp.t('APRES P4 prof de la classe : modifier la note d''un élève inscrit', 'T', (select replace(replace(replace(replace(replace('with x as (update public.assignment_feedback set band = ''7'', feedback = ''ok'' where assignment_id = ''{A1}'' and student_id = ''{S_IN}'' returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('APRES P5 prof de la classe : lire les notes du devoir', 'T', (select replace(replace(replace(replace(replace('select count(*) from public.assignment_feedback where assignment_id = ''{A1}''', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('APRES P6 prof de la classe : supprimer une note', 'T', (select replace(replace(replace(replace(replace('with x as (delete from public.assignment_feedback where assignment_id = ''{A1}'' and student_id = ''{S_IN}'' returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('APRES P7 autre prof : note dans une classe qui n''est pas la sienne', 'T2', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A1}'', ''{S_IN2}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'ERR');
select pg_temp.t('APRES P8 autre prof : lire les notes d''une classe qui n''est pas la sienne', 'T2', (select replace(replace(replace(replace(replace('select count(*) from public.assignment_feedback where assignment_id = ''{A1}''', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 0');
select pg_temp.t('APRES P9 élève : écrire sa propre note', 'S_IN', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A1}'', ''{S_IN}'', ''9'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'ERR');
select pg_temp.t('APRES P10 élève : lire sa note publiée', 'S_IN', (select replace(replace(replace(replace(replace('select count(*) from public.assignment_feedback where assignment_id = ''{A1}'' and student_id = ''{S_IN}''', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('APRES P11 prof créateur de l''examen : note pour un candidat INSCRIT', 'T', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A2}'', ''{S_IN2}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('APRES P12 prof créateur de l''examen : note pour un compte NON inscrit', 'T', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A2}'', ''{S_OUT}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'ERR');
select pg_temp.t('APRES P13 prof invité de l''examen : note pour un candidat INSCRIT', 'T2X', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A2}'', ''{S_IN2}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('APRES P14 prof invité de l''examen : note pour un compte NON inscrit', 'T2X', (select replace(replace(replace(replace(replace('with x as (insert into public.assignment_feedback (assignment_id, student_id, band) values (''{A2}'', ''{S_OUT}'', ''6'') on conflict (assignment_id, student_id) do update set band = excluded.band returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'ERR');
select pg_temp.t('APRES P15 prof invité de l''examen : modifier la note d''un candidat', 'T2X', (select replace(replace(replace(replace(replace('with x as (update public.assignment_feedback set band = ''7'' where assignment_id = ''{A2}'' and student_id = ''{S_IN}'' returning 1) select count(*) from x', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');
select pg_temp.t('APRES P16 prof invité de l''examen : lire les notes de l''examen', 'T2X', (select replace(replace(replace(replace(replace('select count(*) from public.assignment_feedback where assignment_id = ''{A2}''', '{A1}', (select v::text from ids where k='A1')), '{A2}', (select v::text from ids where k='A2')), '{S_IN2}', (select v::text from ids where k='S_IN2')), '{S_IN}', (select v::text from ids where k='S_IN')), '{S_OUT}', (select v::text from ids where k='S_OUT'))), 'OK 1');

-- ---------------------------------------------------------------------
-- 5. L'ancien système a bien disparu.
-- ---------------------------------------------------------------------
insert into res (step, got, expected) values
  ('Table submissions supprimée', case when to_regclass('public.submissions') is null then 'OK' else 'encore là' end, 'OK'),
  ('Fonctions submissions_guard et submit_student_answer supprimées',
     case when to_regprocedure('public.submissions_guard()') is null
           and to_regprocedure('public.submit_student_answer(uuid,uuid,jsonb)') is null then 'OK' else 'encore là' end, 'OK'),
  ('is_assignment_teacher gardée (règle de listening_plays)',
     case when to_regprocedure('public.is_assignment_teacher(uuid)') is not null then 'OK' else 'disparue' end, 'OK'),
  ('Toutes les tables gardent la RLS',
     case when not exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace
                           where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) then 'OK' else 'KO' end, 'OK');

-- ---------------------------------------------------------------------
-- Le résumé : affiché comme un message rouge « ERROR » — c'est voulu, ça
-- annule tout (comme le test 47). Lire seulement la phrase RESULTATS.
-- ---------------------------------------------------------------------
do $res$
declare ok int; ko int; kos text;
begin
  select count(*) filter (where got = expected), count(*) filter (where got is distinct from expected),
         string_agg(case when got is distinct from expected then step || ' : ' || coalesce(got, '∅') || ' (attendu ' || expected || ')' end, ' ; ' order by n)
    into ok, ko, kos from res;
  raise exception 'RESULTATS : % OK / % KO%', ok, ko, case when ko > 0 then ' | A REGARDER : ' || kos else '' end;
end $res$;


rollback;
-- Tout est annulé : la base est exactement comme avant.
