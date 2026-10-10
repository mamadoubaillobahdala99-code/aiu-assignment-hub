-- =====================================================================
-- 53_test_annule.sql — livraison 96 : TEST du script 53, puis TOUT est annulé
-- =====================================================================
-- À lancer AVANT 53_access_rules.sql (le 52 doit déjà être en place), dans
-- l'éditeur SQL de Supabase (« Run without RLS » si on te le demande : c'est
-- seulement l'éditeur).
-- Dans UNE transaction annulée à la fin :
--   1. crée 2 classes, 1 examen, des épreuves, des écoutes et des
--      surlignages de TEST, avec des comptes qui existent déjà (2 profs,
--      3 élèves) — rien n'est gardé ;
--   2. 24 essais AVANT le script 53 (à la place de ces comptes) ;
--   3. le script 53 lui-même (avec ses 5 vérifications) ;
--   4. les 24 mêmes essais APRÈS.
-- Résultat attendu : un message rouge « ERROR: RESULTATS : 49 OK / 0 KO »
-- (voulu : il annule tout). La base n'est pas modifiée, aucun fichier
-- n'est déposé.
-- =====================================================================
begin;

create temp table res (n serial, step text, got text, expected text);
grant all on res to authenticated, anon;
grant usage on sequence res_n_seq to authenticated, anon;
create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated, anon;
create temp table codes (k text primary key, c text);
grant select on codes to authenticated, anon;

-- Le testeur : lance l'appel à la place d'un compte, puis (au besoin) lit le
-- résultat dans la base, puis ANNULE tout ce que l'essai a fait.
-- Une erreur est notée « ERR » suivi du début de son message.
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
    v_got := 'OK ' || coalesce(v1, 'null') || case when p_check is not null then ' | ' || coalesce(v2, 'null') else '' end;
    raise exception using errcode = 'P0001', message = '__annule__';
  exception when others then
    if sqlerrm <> '__annule__' then
      v_got := case when p_who = 'ANON' then 'ERR' else 'ERR ' || left(sqlerrm, 40) end;
    end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into res (step, got, expected) values (p_step, v_got, p_expected);
end $t$;

-- ---------------------------------------------------------------------
-- 1. Données de test (comptes existants ; le reste est créé ici).
-- ---------------------------------------------------------------------
do $setup$
declare
  t uuid; t2 uuid; s1 uuid; s2 uuid; s3 uuid;
  c1 uuid; c2 uuid; cx uuid; e uuid;
  a1 uuid; a2 uuid; ae uuid;
  sec1 uuid; sec2 uuid; sec3 uuid; sece uuid; g1 uuid; g3 uuid; ge uuid;
  q1 uuid; q2 uuid;
  mc constant jsonb := '{"choices":[{"letter":"A","text":"a"},{"letter":"B","text":"b"}]}';
begin
  select id into t  from public.profiles where role = 'teacher' order by created_at, id limit 1;
  select id into t2 from public.profiles where role = 'teacher' and id <> t order by created_at, id limit 1;
  select id into s1 from public.profiles where role = 'student' order by created_at, id limit 1;
  select id into s2 from public.profiles where role = 'student' and id <> s1 order by created_at, id limit 1;
  select id into s3 from public.profiles where role = 'student' and id not in (s1, s2) order by created_at, id limit 1;
  if t is null or t2 is null or s1 is null or s2 is null or s3 is null then
    raise exception 'Test impossible : il faut au moins 2 profs et 3 eleves dans la base.';
  end if;

  -- Une question de chaque prof.
  insert into public.questions (teacher_id, type, skill, prompt, options) values (t, 'multiple_choice', 'listening', 'Q1 test 53', mc) returning id into q1;
  insert into public.questions (teacher_id, type, skill, prompt, options) values (t2, 'multiple_choice', 'listening', 'Q2 test 53', mc) returning id into q2;

  -- Classe c1 du prof t (élèves s1, s2) : épreuve Listening A1, partie 1
  -- (1 écoute) et partie 2 (sans limite). Q1 y est déjà branchée.
  insert into public.classes (name, code, teacher_id, kind) values ('TEST 53 classe', 'T53' || substr(md5(random()::text), 1, 5), t, 'class') returning id into c1;
  insert into public.roster (class_id, student_id) values (c1, s1), (c1, s2);
  insert into public.assignments (class_id, title, type) values (c1, 'TEST 53 listening', 'Listening') returning id into a1;
  insert into public.exam_sections (assignment_id, title, order_index, max_plays) values (a1, 'Part 1', 0, 1) returning id into sec1;
  insert into public.exam_sections (assignment_id, title, order_index, max_plays) values (a1, 'Part 2', 1, null) returning id into sec2;
  insert into public.question_groups (section_id, instruction, order_index) values (sec1, 'Choose.', 0) returning id into g1;
  insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (sec1, q1, 0, g1);

  -- Classe c2 de l'AUTRE prof t2 : épreuve A2. Un ancien branchement de Q1
  -- (question du prof t) y existe déjà.
  insert into public.classes (name, code, teacher_id, kind) values ('TEST 53 autre prof', 'U53' || substr(md5(random()::text), 1, 5), t2, 'class') returning id into c2;
  insert into public.assignments (class_id, title, type) values (c2, 'TEST 53 autre', 'Listening') returning id into a2;
  insert into public.exam_sections (assignment_id, title, order_index) values (a2, 'Part 1', 0) returning id into sec3;
  insert into public.question_groups (section_id, instruction, order_index) values (sec3, 'Choose.', 0) returning id into g3;
  insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (sec3, q1, 0, g3);

  -- Examen (pas encore ouvert) créé par t ; t2 fait partie de l'équipe.
  insert into public.classes (name, code, teacher_id, kind) values ('TEST 53 examen', 'X53' || substr(md5(random()::text), 1, 5), t, 'exam') returning id into cx;
  insert into public.exam_sessions (name, code, container_class_id, created_by) values ('TEST 53 examen', 'E53' || substr(md5(random()::text), 1, 5), cx, t) returning id into e;
  insert into public.exam_session_staff (session_id, teacher_id, role) values (e, t, 'owner');
  insert into public.exam_session_staff (session_id, teacher_id, role) values (e, t2, 'invigilator');
  insert into public.assignments (class_id, title, type) values (cx, 'TEST 53 examen L', 'Listening') returning id into ae;
  insert into public.exam_session_items (session_id, assignment_id, order_index) values (e, ae, 0);
  insert into public.exam_sections (assignment_id, title, order_index) values (ae, 'Part 1', 0) returning id into sece;
  insert into public.question_groups (section_id, instruction, order_index) values (sece, 'Choose.', 0) returning id into ge;

  -- Écoutes déjà faites : s1 a écouté 1 fois la partie 1 ; s2 1 fois la partie 2.
  insert into public.listening_plays (assignment_id, student_id, section_id, plays_used) values (a1, s1, sec1, 1), (a1, s2, sec2, 1);

  -- Surlignages : s1 a une sauvegarde (il y a 1 h) pour le texte de la
  -- partie 1 et pour Q1 ; s2 a 3 copies en double du même texte (1, 2, 3).
  insert into public.reading_highlights (assignment_id, student_id, scope_type, section_id, question_id, word_indices, word_colors, updated_at) values
    (a1, s1, 'passage', sec1, null, array[1], '{"1":"yellow"}', now() - interval '1 hour'),
    (a1, s1, 'question', null, q1, array[1], '{"1":"yellow"}', now() - interval '1 hour'),
    (a1, s2, 'passage', sec1, null, array[1], '{"1":"yellow"}', now() - interval '3 hours'),
    (a1, s2, 'passage', sec1, null, array[2], '{"2":"yellow"}', now() - interval '2 hours'),
    (a1, s2, 'passage', sec1, null, array[3], '{"3":"yellow"}', now() - interval '1 hour');

  insert into ids values ('T', t), ('T2', t2), ('S1', s1), ('S2', s2), ('S3', s3), ('ANON', null),
    ('C1', c1), ('A1', a1), ('SEC1', sec1), ('SEC2', sec2), ('SEC3', sec3), ('SECE', sece),
    ('G1', g1), ('G3', g3), ('GE', ge), ('Q1', q1), ('Q2', q2);
end $setup$;

-- 2. Les 24 essais AVANT le script 53.
select pg_temp.t('AVANT B4a prof : brancher sa question dans l''épreuve de SA classe', 'T', 'with i as (insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (''' || (select v::text from ids where k='SEC1') || ''', ''' || (select v::text from ids where k='Q1') || ''', 9, ''' || (select v::text from ids where k='G1') || ''')) select ''fait''', 'select count(*)::text from public.assignment_questions where section_id = ''' || (select v::text from ids where k='SEC1') || ''' and question_id = ''' || (select v::text from ids where k='Q1') || '''', 'OK fait | 2');
select pg_temp.t('AVANT B4b prof : brancher sa question dans l''épreuve de la classe d''un AUTRE prof → refusé', 'T', 'with i as (insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (''' || (select v::text from ids where k='SEC3') || ''', ''' || (select v::text from ids where k='Q1') || ''', 9, ''' || (select v::text from ids where k='G3') || ''')) select ''fait''', 'select count(*)::text from public.assignment_questions where section_id = ''' || (select v::text from ids where k='SEC3') || ''' and question_id = ''' || (select v::text from ids where k='Q1') || '''', 'OK fait | 2');
select pg_temp.t('AVANT B4c équipe d''un examen (pas propriétaire de la classe) : brancher sa question dans l''épreuve de l''examen', 'T2', 'with i as (insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (''' || (select v::text from ids where k='SECE') || ''', ''' || (select v::text from ids where k='Q2') || ''', 9, ''' || (select v::text from ids where k='GE') || ''')) select ''fait''', 'select count(*)::text from public.assignment_questions where section_id = ''' || (select v::text from ids where k='SECE') || ''' and question_id = ''' || (select v::text from ids where k='Q2') || '''', 'OK fait | 1');
select pg_temp.t('AVANT B4d prof : voir un branchement fait dans la classe d''un autre prof → plus visible', 'T', 'select count(*)::text from public.assignment_questions where section_id = ''' || (select v::text from ids where k='SEC3') || '''', null, 'OK 1');
select pg_temp.t('AVANT B4e prof : enlever un branchement dans la classe d''un autre prof → plus possible', 'T', 'with d as (delete from public.assignment_questions where section_id = ''' || (select v::text from ids where k='SEC3') || ''' returning 1) select count(*)::text from d', null, 'OK 1');
select pg_temp.t('AVANT B4f prof : enlever un branchement dans SA classe → toujours possible', 'T', 'with d as (delete from public.assignment_questions where section_id = ''' || (select v::text from ids where k='SEC1') || ''' returning 1) select count(*)::text from d', null, 'OK 1');
select pg_temp.t('AVANT B9a élève, partie à 1 écoute DÉJÀ écoutée, la page envoie « 5 » → refusé (la base lit 1)', 'S1', 'select (r->>''allowed'') || '','' || (r->>''plays_used'') from (select public.record_audio_play(''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='SEC1') || ''', 5) r) x', null, 'OK true,2');
select pg_temp.t('AVANT B9b élève, partie à 1 écoute, première écoute → permise', 'S2', 'select (r->>''allowed'') || '','' || (r->>''plays_used'') from (select public.record_audio_play(''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='SEC1') || ''', 99) r) x', null, 'OK true,1');
select pg_temp.t('AVANT B9c élève, partie SANS limite, la page envoie « 1 » → permise', 'S2', 'select (r->>''allowed'') || '','' || (r->>''plays_used'') from (select public.record_audio_play(''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='SEC2') || ''', 1) r) x', null, 'OK false,1');
select pg_temp.t('AVANT B9d élève NON inscrit dans la classe → refusé', 'S3', 'select (r->>''allowed'') || '','' || (r->>''plays_used'') from (select public.record_audio_play(''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='SEC1') || ''', 1) r) x', null, 'OK true,1');
select pg_temp.t('AVANT B9e élève : partie d''une AUTRE épreuve → refusé', 'S1', 'select (r->>''allowed'') || '','' || (r->>''plays_used'') from (select public.record_audio_play(''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='SEC3') || ''', 1) r) x', null, 'OK true,1');
select pg_temp.t('AVANT B9f sans compte (anon) → refusé', 'ANON', 'select (r->>''allowed'') || '','' || (r->>''plays_used'') from (select public.record_audio_play(''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='SEC1') || ''', 1) r) x', null, 'ERR');
select pg_temp.t('AVANT B10a prof : déposer une image dans SON dossier images', 'T', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''images/' || (select v::text from ids where k='T') || '/test53.png'')) select ''fait''', 'select count(*)::text from storage.objects where name = ''images/' || (select v::text from ids where k='T') || '/test53.png''', 'OK fait | 1');
select pg_temp.t('AVANT B10b prof : déposer un audio dans SON dossier audio', 'T', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''audio/' || (select v::text from ids where k='T') || '/test53.mp3'')) select ''fait''', 'select count(*)::text from storage.objects where name = ''audio/' || (select v::text from ids where k='T') || '/test53.mp3''', 'OK fait | 1');
select pg_temp.t('AVANT B10c prof : déposer un document Speaking dans SON dossier', 'T', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''speaking/' || (select v::text from ids where k='T') || '/test53.pdf'')) select ''fait''', 'select count(*)::text from storage.objects where name = ''speaking/' || (select v::text from ids where k='T') || '/test53.pdf''', 'OK fait | 1');
select pg_temp.t('AVANT B10d élève : déposer un fichier dans le dossier de sa classe → refusé', 'S1', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''' || (select v::text from ids where k='C1') || '/test53.png'')) select ''fait''', 'select count(*)::text from storage.objects where name = ''' || (select v::text from ids where k='C1') || '/test53.png''', 'OK fait | 1');
select pg_temp.t('AVANT B10e élève : déposer un fichier dans « images/<lui-même> » → refusé', 'S1', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''images/' || (select v::text from ids where k='S1') || '/test53.png'')) select ''fait''', 'select count(*)::text from storage.objects where name = ''images/' || (select v::text from ids where k='S1') || '/test53.png''', 'OK fait | 1');
select pg_temp.t('AVANT B10f prof : déposer un fichier dans le dossier d''une classe → refusé (le site ne le fait pas)', 'T', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''' || (select v::text from ids where k='C1') || '/test53b.png'')) select ''fait''', 'select count(*)::text from storage.objects where name = ''' || (select v::text from ids where k='C1') || '/test53b.png''', 'OK fait | 1');
select pg_temp.t('AVANT B10g prof : déposer dans le dossier d''un AUTRE prof → refusé (déjà avant)', 'T', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''images/' || (select v::text from ids where k='T2') || '/test53.png'')) select ''fait''', null, 'ERR new row violates row-level security poli');
select pg_temp.t('AVANT B10h sans compte (anon) → refusé', 'ANON', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''images/' || (select v::text from ids where k='T') || '/anon53.png'')) select ''fait''', null, 'ERR');
select pg_temp.t('AVANT H1 élève : 2e sauvegarde des surlignages d''un texte → REMPLACE (avant : une 2e ligne, et l''ancienne restait « la plus récente »)', 'S1', 'with i as (insert into public.reading_highlights (assignment_id, student_id, scope_type, section_id, question_id, option_key, word_indices, word_colors, updated_at) values (''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='S1') || ''', ''passage'', ''' || (select v::text from ids where k='SEC1') || ''', null, null, array[5], ''{}''::jsonb, ''2000-01-01'') on conflict (assignment_id, student_id, scope_type, section_id, question_id, option_key) do update set word_indices = excluded.word_indices, word_colors = excluded.word_colors, updated_at = excluded.updated_at) select ''fait''', 'select count(*)::text || '','' || bool_and(updated_at > ''2001-01-01'')::text || '','' || (select array_to_string(word_indices, '','') from public.reading_highlights where assignment_id = ''' || (select v::text from ids where k='A1') || ''' and student_id = ''' || (select v::text from ids where k='S1') || ''' and scope_type = ''passage'' order by updated_at desc limit 1) from public.reading_highlights where assignment_id = ''' || (select v::text from ids where k='A1') || ''' and student_id = ''' || (select v::text from ids where k='S1') || ''' and scope_type = ''passage''', 'OK fait | 2,false,1');
select pg_temp.t('AVANT H2 élève : 2e sauvegarde des surlignages d''une question → REMPLACE', 'S1', 'with i as (insert into public.reading_highlights (assignment_id, student_id, scope_type, section_id, question_id, option_key, word_indices, word_colors, updated_at) values (''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='S1') || ''', ''question'', null, ''' || (select v::text from ids where k='Q1') || ''', null, array[5], ''{}''::jsonb, ''2000-01-01'') on conflict (assignment_id, student_id, scope_type, section_id, question_id, option_key) do update set word_indices = excluded.word_indices, word_colors = excluded.word_colors, updated_at = excluded.updated_at) select ''fait''', 'select count(*)::text || '','' || bool_and(updated_at > ''2001-01-01'')::text || '','' || (select array_to_string(word_indices, '','') from public.reading_highlights where assignment_id = ''' || (select v::text from ids where k='A1') || ''' and student_id = ''' || (select v::text from ids where k='S1') || ''' and scope_type = ''question'' order by updated_at desc limit 1) from public.reading_highlights where assignment_id = ''' || (select v::text from ids where k='A1') || ''' and student_id = ''' || (select v::text from ids where k='S1') || ''' and scope_type = ''question''', 'OK fait | 2,false,1');
select pg_temp.t('AVANT H3 élève : les 3 copies en double d''avant → il reste la plus récente', 'S2', 'select ''lu''', 'select count(*)::text || '' : '' || string_agg(array_to_string(word_indices, '',''), '';'' order by updated_at) from public.reading_highlights where student_id = ''' || (select v::text from ids where k='S2') || ''' and assignment_id = ''' || (select v::text from ids where k='A1') || '''', 'OK lu | 3 : 1;2;3');
select pg_temp.t('AVANT H4 élève : ne voit pas les surlignages d''un autre élève (inchangé)', 'S1', 'select count(*)::text from public.reading_highlights where student_id = ''' || (select v::text from ids where k='S2') || '''', null, 'OK 0');

-- 3. Le script 53 lui-même (avec ses 5 vérifications). S'il échoue, tout s'arrête.

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
insert into res (step, got, expected) values ('Script 53 appliqué, 5 vérifications passées', 'OK', 'OK');

-- 4. Les 24 mêmes essais APRÈS le script 53.
select pg_temp.t('APRES B4a prof : brancher sa question dans l''épreuve de SA classe', 'T', 'with i as (insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (''' || (select v::text from ids where k='SEC1') || ''', ''' || (select v::text from ids where k='Q1') || ''', 9, ''' || (select v::text from ids where k='G1') || ''')) select ''fait''', 'select count(*)::text from public.assignment_questions where section_id = ''' || (select v::text from ids where k='SEC1') || ''' and question_id = ''' || (select v::text from ids where k='Q1') || '''', 'OK fait | 2');
select pg_temp.t('APRES B4b prof : brancher sa question dans l''épreuve de la classe d''un AUTRE prof → refusé', 'T', 'with i as (insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (''' || (select v::text from ids where k='SEC3') || ''', ''' || (select v::text from ids where k='Q1') || ''', 9, ''' || (select v::text from ids where k='G3') || ''')) select ''fait''', 'select count(*)::text from public.assignment_questions where section_id = ''' || (select v::text from ids where k='SEC3') || ''' and question_id = ''' || (select v::text from ids where k='Q1') || '''', 'ERR new row violates row-level security poli');
select pg_temp.t('APRES B4c équipe d''un examen (pas propriétaire de la classe) : brancher sa question dans l''épreuve de l''examen', 'T2', 'with i as (insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (''' || (select v::text from ids where k='SECE') || ''', ''' || (select v::text from ids where k='Q2') || ''', 9, ''' || (select v::text from ids where k='GE') || ''')) select ''fait''', 'select count(*)::text from public.assignment_questions where section_id = ''' || (select v::text from ids where k='SECE') || ''' and question_id = ''' || (select v::text from ids where k='Q2') || '''', 'OK fait | 1');
select pg_temp.t('APRES B4d prof : voir un branchement fait dans la classe d''un autre prof → plus visible', 'T', 'select count(*)::text from public.assignment_questions where section_id = ''' || (select v::text from ids where k='SEC3') || '''', null, 'OK 0');
select pg_temp.t('APRES B4e prof : enlever un branchement dans la classe d''un autre prof → plus possible', 'T', 'with d as (delete from public.assignment_questions where section_id = ''' || (select v::text from ids where k='SEC3') || ''' returning 1) select count(*)::text from d', null, 'OK 0');
select pg_temp.t('APRES B4f prof : enlever un branchement dans SA classe → toujours possible', 'T', 'with d as (delete from public.assignment_questions where section_id = ''' || (select v::text from ids where k='SEC1') || ''' returning 1) select count(*)::text from d', null, 'OK 1');
select pg_temp.t('APRES B9a élève, partie à 1 écoute DÉJÀ écoutée, la page envoie « 5 » → refusé (la base lit 1)', 'S1', 'select (r->>''allowed'') || '','' || (r->>''plays_used'') from (select public.record_audio_play(''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='SEC1') || ''', 5) r) x', null, 'OK false,1');
select pg_temp.t('APRES B9b élève, partie à 1 écoute, première écoute → permise', 'S2', 'select (r->>''allowed'') || '','' || (r->>''plays_used'') from (select public.record_audio_play(''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='SEC1') || ''', 99) r) x', null, 'OK true,1');
select pg_temp.t('APRES B9c élève, partie SANS limite, la page envoie « 1 » → permise', 'S2', 'select (r->>''allowed'') || '','' || (r->>''plays_used'') from (select public.record_audio_play(''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='SEC2') || ''', 1) r) x', null, 'OK true,2');
select pg_temp.t('APRES B9d élève NON inscrit dans la classe → refusé', 'S3', 'select (r->>''allowed'') || '','' || (r->>''plays_used'') from (select public.record_audio_play(''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='SEC1') || ''', 1) r) x', null, 'ERR Not enrolled in this class');
select pg_temp.t('APRES B9e élève : partie d''une AUTRE épreuve → refusé', 'S1', 'select (r->>''allowed'') || '','' || (r->>''plays_used'') from (select public.record_audio_play(''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='SEC3') || ''', 1) r) x', null, 'ERR This part is not in this assignment');
select pg_temp.t('APRES B9f sans compte (anon) → refusé', 'ANON', 'select (r->>''allowed'') || '','' || (r->>''plays_used'') from (select public.record_audio_play(''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='SEC1') || ''', 1) r) x', null, 'ERR');
select pg_temp.t('APRES B10a prof : déposer une image dans SON dossier images', 'T', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''images/' || (select v::text from ids where k='T') || '/test53.png'')) select ''fait''', 'select count(*)::text from storage.objects where name = ''images/' || (select v::text from ids where k='T') || '/test53.png''', 'OK fait | 1');
select pg_temp.t('APRES B10b prof : déposer un audio dans SON dossier audio', 'T', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''audio/' || (select v::text from ids where k='T') || '/test53.mp3'')) select ''fait''', 'select count(*)::text from storage.objects where name = ''audio/' || (select v::text from ids where k='T') || '/test53.mp3''', 'OK fait | 1');
select pg_temp.t('APRES B10c prof : déposer un document Speaking dans SON dossier', 'T', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''speaking/' || (select v::text from ids where k='T') || '/test53.pdf'')) select ''fait''', 'select count(*)::text from storage.objects where name = ''speaking/' || (select v::text from ids where k='T') || '/test53.pdf''', 'OK fait | 1');
select pg_temp.t('APRES B10d élève : déposer un fichier dans le dossier de sa classe → refusé', 'S1', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''' || (select v::text from ids where k='C1') || '/test53.png'')) select ''fait''', 'select count(*)::text from storage.objects where name = ''' || (select v::text from ids where k='C1') || '/test53.png''', 'ERR new row violates row-level security poli');
select pg_temp.t('APRES B10e élève : déposer un fichier dans « images/<lui-même> » → refusé', 'S1', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''images/' || (select v::text from ids where k='S1') || '/test53.png'')) select ''fait''', 'select count(*)::text from storage.objects where name = ''images/' || (select v::text from ids where k='S1') || '/test53.png''', 'ERR new row violates row-level security poli');
select pg_temp.t('APRES B10f prof : déposer un fichier dans le dossier d''une classe → refusé (le site ne le fait pas)', 'T', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''' || (select v::text from ids where k='C1') || '/test53b.png'')) select ''fait''', 'select count(*)::text from storage.objects where name = ''' || (select v::text from ids where k='C1') || '/test53b.png''', 'ERR new row violates row-level security poli');
select pg_temp.t('APRES B10g prof : déposer dans le dossier d''un AUTRE prof → refusé (déjà avant)', 'T', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''images/' || (select v::text from ids where k='T2') || '/test53.png'')) select ''fait''', null, 'ERR new row violates row-level security poli');
select pg_temp.t('APRES B10h sans compte (anon) → refusé', 'ANON', 'with i as (insert into storage.objects (bucket_id, name) values (''assignment-files'', ''images/' || (select v::text from ids where k='T') || '/anon53.png'')) select ''fait''', null, 'ERR');
select pg_temp.t('APRES H1 élève : 2e sauvegarde des surlignages d''un texte → REMPLACE (avant : une 2e ligne, et l''ancienne restait « la plus récente »)', 'S1', 'with i as (insert into public.reading_highlights (assignment_id, student_id, scope_type, section_id, question_id, option_key, word_indices, word_colors, updated_at) values (''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='S1') || ''', ''passage'', ''' || (select v::text from ids where k='SEC1') || ''', null, null, array[5], ''{}''::jsonb, ''2000-01-01'') on conflict (assignment_id, student_id, scope_type, section_id, question_id, option_key) do update set word_indices = excluded.word_indices, word_colors = excluded.word_colors, updated_at = excluded.updated_at) select ''fait''', 'select count(*)::text || '','' || bool_and(updated_at > ''2001-01-01'')::text || '','' || (select array_to_string(word_indices, '','') from public.reading_highlights where assignment_id = ''' || (select v::text from ids where k='A1') || ''' and student_id = ''' || (select v::text from ids where k='S1') || ''' and scope_type = ''passage'' order by updated_at desc limit 1) from public.reading_highlights where assignment_id = ''' || (select v::text from ids where k='A1') || ''' and student_id = ''' || (select v::text from ids where k='S1') || ''' and scope_type = ''passage''', 'OK fait | 1,true,5');
select pg_temp.t('APRES H2 élève : 2e sauvegarde des surlignages d''une question → REMPLACE', 'S1', 'with i as (insert into public.reading_highlights (assignment_id, student_id, scope_type, section_id, question_id, option_key, word_indices, word_colors, updated_at) values (''' || (select v::text from ids where k='A1') || ''', ''' || (select v::text from ids where k='S1') || ''', ''question'', null, ''' || (select v::text from ids where k='Q1') || ''', null, array[5], ''{}''::jsonb, ''2000-01-01'') on conflict (assignment_id, student_id, scope_type, section_id, question_id, option_key) do update set word_indices = excluded.word_indices, word_colors = excluded.word_colors, updated_at = excluded.updated_at) select ''fait''', 'select count(*)::text || '','' || bool_and(updated_at > ''2001-01-01'')::text || '','' || (select array_to_string(word_indices, '','') from public.reading_highlights where assignment_id = ''' || (select v::text from ids where k='A1') || ''' and student_id = ''' || (select v::text from ids where k='S1') || ''' and scope_type = ''question'' order by updated_at desc limit 1) from public.reading_highlights where assignment_id = ''' || (select v::text from ids where k='A1') || ''' and student_id = ''' || (select v::text from ids where k='S1') || ''' and scope_type = ''question''', 'OK fait | 1,true,5');
select pg_temp.t('APRES H3 élève : les 3 copies en double d''avant → il reste la plus récente', 'S2', 'select ''lu''', 'select count(*)::text || '' : '' || string_agg(array_to_string(word_indices, '',''), '';'' order by updated_at) from public.reading_highlights where student_id = ''' || (select v::text from ids where k='S2') || ''' and assignment_id = ''' || (select v::text from ids where k='A1') || '''', 'OK lu | 1 : 3');
select pg_temp.t('APRES H4 élève : ne voit pas les surlignages d''un autre élève (inchangé)', 'S1', 'select count(*)::text from public.reading_highlights where student_id = ''' || (select v::text from ids where k='S2') || '''', null, 'OK 0');

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
