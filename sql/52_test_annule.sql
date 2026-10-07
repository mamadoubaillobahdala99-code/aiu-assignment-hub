-- =====================================================================
-- 52_test_annule.sql — livraison 94 : TEST du script 52, puis TOUT est annulé
-- =====================================================================
-- À lancer AVANT 52_exam_integrity.sql (le 51 doit déjà être en place), dans
-- l'éditeur SQL de Supabase (« Run without RLS » si on te le demande : c'est
-- seulement l'éditeur).
-- Dans UNE transaction annulée à la fin :
--   1. crée des classes, des devoirs et 4 examens de TEST, avec des comptes
--      qui existent déjà (2 profs, 3 élèves) — rien n'est gardé ;
--   2. 24 essais AVANT le script 52 (à la place de ces comptes) ;
--   3. le script 52 lui-même (avec ses 6 vérifications) ;
--   4. les 24 mêmes essais APRÈS.
-- Résultat attendu : un message rouge « ERROR: RESULTATS : 49 OK / 0 KO »
-- (voulu : il annule tout). La base n'est pas modifiée.
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
-- 1. Données de test (comptes existants ; classes, devoirs, examens créés ici).
-- ---------------------------------------------------------------------
do $setup$
declare
  t uuid; t2 uuid; s1 uuid; s2 uuid; s3 uuid;
  c1 uuid; c3 uuid; cx uuid; cx2 uuid; cx3 uuid; cx5 uuid;
  e uuid; e2 uuid; e3 uuid; e5 uuid;
  a1 uuid; a6 uuid; ac uuid; ar uuid; aw uuid; aw4 uuid; ar2 uuid; aw2 uuid; ar3 uuid; ar5 uuid; ap5 uuid;
  sec uuid; g uuid; sw uuid; sw2 uuid; sw4 uuid;
  q1 uuid; q3 uuid; q5 uuid; q6 uuid; q7 uuid; q8 uuid;
  mc constant jsonb := '{"choices":[{"letter":"A","text":"a"},{"letter":"B","text":"b"},{"letter":"C","text":"c"}]}';
begin
  select id into t  from public.profiles where role = 'teacher' order by created_at, id limit 1;
  select id into t2 from public.profiles where role = 'teacher' and id <> t order by created_at, id limit 1;
  select id into s1 from public.profiles where role = 'student' order by created_at, id limit 1;
  select id into s2 from public.profiles where role = 'student' and id <> s1 order by created_at, id limit 1;
  select id into s3 from public.profiles where role = 'student' and id not in (s1, s2) order by created_at, id limit 1;
  if t is null or t2 is null or s1 is null or s2 is null or s3 is null then
    raise exception 'Test impossible : il faut au moins 2 profs et 3 eleves dans la base.';
  end if;

  -- Questions (QCM A / B / C) et corrigés.
  insert into public.questions (teacher_id, type, skill, prompt, options) values (t, 'multiple_choice', 'reading', 'Q1', mc) returning id into q1;
  insert into public.questions (teacher_id, type, skill, prompt, options) values (t, 'multiple_choice', 'reading', 'Q3', mc) returning id into q3;
  insert into public.questions (teacher_id, type, skill, prompt, options) values (t, 'multiple_choice', 'reading', 'Q5', mc) returning id into q5;
  insert into public.questions (teacher_id, type, skill, prompt, options) values (t, 'multiple_choice', 'reading', 'Q6', mc) returning id into q6;
  insert into public.questions (teacher_id, type, skill, prompt, options) values (t, 'multiple_choice', 'reading', 'Q7', mc) returning id into q7;
  insert into public.questions (teacher_id, type, skill, prompt, options) values (t, 'multiple_choice', 'reading', 'Q8', mc) returning id into q8;
  insert into public.question_answer_key (question_id, correct_answer) values (q1, '"C"'), (q3, '"A"'), (q5, '"B"'), (q6, '"A"'), (q7, '"A"'), (q8, '"A"');

  -- Classe ordinaire c1 (s1, s2) ; c3 : une autre classe du même prof.
  insert into public.classes (name, code, teacher_id, kind) values ('TEST 52 classe', 'T52' || substr(md5(random()::text), 1, 5), t, 'class') returning id into c1;
  insert into public.classes (name, code, teacher_id, kind) values ('TEST 52 autre classe', 'U52' || substr(md5(random()::text), 1, 5), t, 'class') returning id into c3;
  insert into public.roster (class_id, student_id) values (c1, s1), (c1, s2);
  -- A1 : devoir Reading de 20 min (Q1). s1 a commencé il y a 23 min, s2 il y a 21 min.
  insert into public.assignments (class_id, title, type, time_limit_minutes) values (c1, 'TEST 52 devoir', 'Reading', 20) returning id into a1;
  insert into public.exam_sections (assignment_id, title, order_index) values (a1, 'Part 1', 0) returning id into sec;
  insert into public.question_groups (section_id, instruction, order_index) values (sec, 'Choose.', 0) returning id into g;
  insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (sec, q1, 0, g);
  insert into public.exam_attempts (assignment_id, student_id, started_at) values (a1, s1, now() - interval '23 minutes'), (a1, s2, now() - interval '21 minutes');
  insert into public.exam_answer_drafts (assignment_id, student_id, answers, updated_at) values (a1, s1, jsonb_build_object(q1::text, 'C'), now() - interval '4 minutes');
  -- AC : devoir publié (score + corrigé visibles) qui contient AUSSI Q5 ; s1 n'y a pas répondu.
  insert into public.assignments (class_id, title, type, auto_release_score, show_answer_review) values (c1, 'TEST 52 publie', 'Reading', true, true) returning id into ac;
  insert into public.exam_sections (assignment_id, title, order_index) values (ac, 'Part 1', 0) returning id into sec;
  insert into public.question_groups (section_id, instruction, order_index) values (sec, 'Choose.', 0) returning id into g;
  insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (sec, q5, 0, g);
  -- AH : devoir où le score est montré mais les CORRECTIONS CACHÉES par le prof ; s1 a répondu à Q5 ici.
  insert into public.assignments (class_id, title, type, auto_release_score, show_answer_review) values (c1, 'TEST 52 sans corrections', 'Reading', true, false) returning id into ar5;
  insert into public.exam_sections (assignment_id, title, order_index) values (ar5, 'Part 1', 0) returning id into sec;
  insert into public.question_groups (section_id, instruction, order_index) values (sec, 'Choose.', 0) returning id into g;
  insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (sec, q5, 0, g);
  insert into public.student_answers (assignment_id, student_id, question_id, response, is_correct, points_earned) values (ar5, s1, q5, '"B"', true, 1);
  -- A6 : devoir publié où s1 a répondu à Q6.
  insert into public.assignments (class_id, title, type, auto_release_score, show_answer_review) values (c1, 'TEST 52 publie 2', 'Reading', true, true) returning id into a6;
  insert into public.exam_sections (assignment_id, title, order_index) values (a6, 'Part 1', 0) returning id into sec;
  insert into public.question_groups (section_id, instruction, order_index) values (sec, 'Choose.', 0) returning id into g;
  insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (sec, q6, 0, g);
  insert into public.student_answers (assignment_id, student_id, question_id, response, is_correct, points_earned) values (a6, s1, q6, '"A"', true, 1);

  -- Examen E (ouvert, strict) : AR Reading 30 min (Q3), AW Writing 60 min, AW4 Writing sans durée, AR5 (Q5).
  insert into public.classes (name, code, teacher_id, kind) values ('TEST 52 examen', 'X52' || substr(md5(random()::text), 1, 5), t, 'exam') returning id into cx;
  insert into public.exam_sessions (name, code, container_class_id, created_by) values ('TEST 52 examen', 'E52' || substr(md5(random()::text), 1, 5), cx, t) returning id into e;
  insert into public.exam_session_staff (session_id, teacher_id, role) values (e, t, 'owner');
  insert into public.assignments (class_id, title, type, time_limit_minutes) values (cx, 'TEST 52 R', 'Reading', 30) returning id into ar;
  insert into public.assignments (class_id, title, type, time_limit_minutes) values (cx, 'TEST 52 W', 'Writing', 60) returning id into aw;
  insert into public.assignments (class_id, title, type) values (cx, 'TEST 52 W4', 'Writing') returning id into aw4;
  insert into public.exam_session_items (session_id, assignment_id, order_index) values (e, ar, 0), (e, aw, 1), (e, aw4, 2);
  insert into public.exam_sections (assignment_id, title, order_index) values (ar, 'Part 1', 0) returning id into sec;
  insert into public.question_groups (section_id, instruction, order_index) values (sec, 'Choose.', 0) returning id into g;
  insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (sec, q3, 0, g);
  insert into public.exam_sections (assignment_id, title, order_index, task_number) values (aw, 'Task 1', 0, 1) returning id into sw;
  insert into public.exam_sections (assignment_id, title, order_index, task_number) values (aw4, 'Task 1', 0, 1) returning id into sw4;
  insert into public.roster (class_id, student_id) values (cx, s1), (cx, s2);
  update public.exam_sessions set opened_at = now() - interval '10 minutes' where id = e;
  insert into public.exam_attempts (assignment_id, student_id, started_at) values (ar, s1, now() - interval '5 minutes'), (ar, s2, now() - interval '5 minutes'),
                                                                              (aw, s1, now() - interval '5 minutes'), (aw, s2, now() - interval '5 minutes');
  -- s1 : copie de secours « A » et texte « avant le gel », puis GELÉ par le surveillant.
  insert into public.exam_answer_drafts (assignment_id, student_id, answers, updated_at) values (ar, s1, jsonb_build_object(q3::text, 'A'), now() - interval '1 minute');
  insert into public.writing_responses (assignment_id, section_id, student_id, content_html, word_count) values (aw, sw, s1, '<p>avant le gel</p>', 3);
  insert into public.exam_incidents (session_id, student_id, assignment_id, kind, freezes) values (e, s1, ar, 'tab_switch', true);

  -- Examen E2 : ouvert il y a 1 h, heure de fin passée depuis 10 min (personne n'a cliqué Close).
  insert into public.classes (name, code, teacher_id, kind) values ('TEST 52 examen 2', 'Y52' || substr(md5(random()::text), 1, 5), t, 'exam') returning id into cx2;
  insert into public.exam_sessions (name, code, container_class_id, created_by) values ('TEST 52 examen 2', 'F52' || substr(md5(random()::text), 1, 5), cx2, t) returning id into e2;
  insert into public.exam_session_staff (session_id, teacher_id, role) values (e2, t, 'owner');
  insert into public.assignments (class_id, title, type) values (cx2, 'TEST 52 R2', 'Reading') returning id into ar2;
  insert into public.assignments (class_id, title, type) values (cx2, 'TEST 52 W2', 'Writing') returning id into aw2;
  insert into public.exam_session_items (session_id, assignment_id, order_index) values (e2, ar2, 0), (e2, aw2, 1);
  insert into public.exam_sections (assignment_id, title, order_index) values (ar2, 'Part 1', 0) returning id into sec;
  insert into public.question_groups (section_id, instruction, order_index) values (sec, 'Choose.', 0) returning id into g;
  insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (sec, q7, 0, g);
  insert into public.exam_sections (assignment_id, title, order_index, task_number) values (aw2, 'Task 1', 0, 1) returning id into sw2;
  insert into public.roster (class_id, student_id) values (cx2, s1);
  update public.exam_sessions set opened_at = now() - interval '1 hour', closes_at = now() - interval '10 minutes' where id = e2;
  insert into public.exam_attempts (assignment_id, student_id, started_at) values (ar2, s1, now() - interval '40 minutes'), (aw2, s1, now() - interval '40 minutes');

  -- Examen E3 : heure de fin passée depuis 1 min seulement.
  insert into public.classes (name, code, teacher_id, kind) values ('TEST 52 examen 3', 'Z52' || substr(md5(random()::text), 1, 5), t, 'exam') returning id into cx3;
  insert into public.exam_sessions (name, code, container_class_id, created_by) values ('TEST 52 examen 3', 'G52' || substr(md5(random()::text), 1, 5), cx3, t) returning id into e3;
  insert into public.exam_session_staff (session_id, teacher_id, role) values (e3, t, 'owner');
  insert into public.assignments (class_id, title, type) values (cx3, 'TEST 52 R3', 'Reading') returning id into ar3;
  insert into public.exam_session_items (session_id, assignment_id, order_index) values (e3, ar3, 0);
  insert into public.exam_sections (assignment_id, title, order_index) values (ar3, 'Part 1', 0) returning id into sec;
  insert into public.question_groups (section_id, instruction, order_index) values (sec, 'Choose.', 0) returning id into g;
  insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (sec, q8, 0, g);
  insert into public.roster (class_id, student_id) values (cx3, s1);
  update public.exam_sessions set opened_at = now() - interval '1 hour', closes_at = now() - interval '1 minute' where id = e3;
  insert into public.exam_attempts (assignment_id, student_id, started_at) values (ar3, s1, now() - interval '40 minutes');

  -- Examen E5 : ouvert, résultats PUBLIÉS (pas encore fermé). s1 y est candidat.
  insert into public.classes (name, code, teacher_id, kind) values ('TEST 52 publie', 'W52' || substr(md5(random()::text), 1, 5), t, 'exam') returning id into cx5;
  insert into public.exam_sessions (name, code, container_class_id, created_by) values ('TEST 52 publie', 'H52' || substr(md5(random()::text), 1, 5), cx5, t) returning id into e5;
  insert into public.exam_session_staff (session_id, teacher_id, role) values (e5, t, 'owner');
  insert into public.roster (class_id, student_id) values (cx5, s1);
  update public.exam_sessions set opened_at = now() - interval '1 hour', results_released_at = now() where id = e5;

  insert into ids values ('T', t), ('T2', t2), ('S1', s1), ('S2', s2), ('S3', s3), ('ANON', null),
    ('C3', c3), ('A1', a1), ('AR', ar), ('AW', aw), ('SW', sw), ('SW4', sw4), ('AR2', ar2), ('SW2', sw2), ('AR3', ar3),
    ('E', e), ('E5', e5), ('Q1', q1), ('Q3', q3), ('Q5', q5), ('Q6', q6), ('Q7', q7), ('Q8', q8);
  insert into codes select 'E', code from public.exam_sessions where id = e;
  insert into codes select 'E5', code from public.exam_sessions where id = e5;
end $setup$;

-- 2. Les 24 essais AVANT le script 52.
select pg_temp.t('AVANT B1a candidat GELÉ : sauvegarde Reading refusée (la page réessaiera après le gel)', 'S1', 'select (r->>''saved'') || '','' || coalesce(r->>''reason'',''-'') from (select public.save_answer_drafts(''' || (select v::text from ids where k='AR') || ''', ''{"' || (select v::text from ids where k='Q3') || '":"B"}''::jsonb) r) x', null, 'OK true,-');
select pg_temp.t('AVANT B1b candidat GELÉ : sauvegarde Writing refusée (la page réessaiera après le gel)', 'S1', 'select public.save_writing_draft(''' || (select v::text from ids where k='SW') || ''', ''<p>pendant le gel</p>'', 3)::text', null, 'OK {"saved": true}');
select pg_temp.t('AVANT B1c candidat GELÉ : la remise Reading garde la copie d''AVANT le gel (A), pas ce qui est envoyé (B)', 'S1', 'select public.submit_student_answers(''' || (select v::text from ids where k='AR') || ''', ''{"' || (select v::text from ids where k='Q3') || '":"B"}''::jsonb)::text', 'select response::text from public.student_answers where student_id = ''' || (select v::text from ids where k='S1') || ''' and question_id = ''' || (select v::text from ids where k='Q3') || '''', 'OK {"submitted": 1} | "B"');
select pg_temp.t('AVANT B1d candidat GELÉ : la remise Writing marche (texte d''avant le gel)', 'S1', 'select public.submit_writing(''' || (select v::text from ids where k='AW') || ''')::text', 'select string_agg(content_html, ''|'') from public.writing_responses where student_id = ''' || (select v::text from ids where k='S1') || ''' and assignment_id = ''' || (select v::text from ids where k='AW') || '''', 'OK {"submitted": true} | <p>avant le gel</p>');
select pg_temp.t('AVANT B1e candidat NON gelé : sauvegarde Reading normale', 'S2', 'select (r->>''saved'') from (select public.save_answer_drafts(''' || (select v::text from ids where k='AR') || ''', ''{"' || (select v::text from ids where k='Q3') || '":"B"}''::jsonb) r) x', null, 'OK true');
select pg_temp.t('AVANT B1f candidat NON gelé : remise Reading normale (B gardé)', 'S2', 'select public.submit_student_answers(''' || (select v::text from ids where k='AR') || ''', ''{"' || (select v::text from ids where k='Q3') || '":"B"}''::jsonb)::text', 'select response::text from public.student_answers where student_id = ''' || (select v::text from ids where k='S2') || ''' and question_id = ''' || (select v::text from ids where k='Q3') || '''', 'OK {"submitted": 1} | "B"');
select pg_temp.t('AVANT B2a heure de fin passée (10 min) : sauvegarde Writing d''examen refusée', 'S1', 'select public.save_writing_draft(''' || (select v::text from ids where k='SW2') || ''', ''<p>apres la fin</p>'', 3)::text', null, 'OK {"saved": true}');
select pg_temp.t('AVANT B2b heure de fin passée (10 min) : remise Reading refusée (le serveur ramasse la copie de secours)', 'S1', 'select public.submit_student_answers(''' || (select v::text from ids where k='AR2') || ''', ''{"' || (select v::text from ids where k='Q7') || '":"A"}''::jsonb)::text', null, 'OK {"submitted": 1}');
select pg_temp.t('AVANT B2c heure de fin passée depuis 1 min : la remise passe encore (marge réseau)', 'S1', 'select public.submit_student_answers(''' || (select v::text from ids where k='AR3') || ''', ''{"' || (select v::text from ids where k='Q8') || '":"A"}''::jsonb)::text', null, 'OK {"submitted": 1}');
select pg_temp.t('AVANT B2d examen ouvert, épreuve Writing PAS commencée : rien n''est enregistré', 'S2', 'select public.save_writing_draft(''' || (select v::text from ids where k='SW4') || ''', ''<p>sans commencer</p>'', 2)::text', null, 'OK {"saved": true}');
select pg_temp.t('AVANT B2e examen ouvert, Writing commencé, pas gelé : sauvegarde normale', 'S2', 'select public.save_writing_draft(''' || (select v::text from ids where k='SW') || ''', ''<p>normal</p>'', 1)::text', null, 'OK {"saved": true}');
select pg_temp.t('AVANT B3a devoir de 20 min commencé il y a 23 min : sauvegarde refusée (marge 2 min)', 'S1', 'select (r->>''saved'') || '','' || coalesce(r->>''reason'',''-'') from (select public.save_answer_drafts(''' || (select v::text from ids where k='A1') || ''', ''{"' || (select v::text from ids where k='Q1') || '":"B"}''::jsonb) r) x', null, 'OK true,-');
select pg_temp.t('AVANT B3b devoir de 20 min commencé il y a 21 min : sauvegarde encore acceptée', 'S2', 'select (r->>''saved'') || '','' || coalesce(r->>''reason'',''-'') from (select public.save_answer_drafts(''' || (select v::text from ids where k='A1') || ''', ''{"' || (select v::text from ids where k='Q1') || '":"B"}''::jsonb) r) x', null, 'OK true,-');
select pg_temp.t('AVANT B3c devoir de 20 min commencé il y a 23 min : remise refusée', 'S1', 'select public.submit_student_answers(''' || (select v::text from ids where k='A1') || ''', ''{"' || (select v::text from ids where k='Q1') || '":"B"}''::jsonb)::text', null, 'OK {"submitted": 1}');
select pg_temp.t('AVANT B3d prof : ramassage du devoir (copie de secours, 23 min)', 'T', 'select public.collect_class_papers(''' || (select v::text from ids where k='A1') || ''')::text', 'select string_agg(response::text, '','') from public.student_answers where student_id = ''' || (select v::text from ids where k='S1') || ''' and question_id = ''' || (select v::text from ids where k='Q1') || '''', 'OK 0 | null');
select pg_temp.t('AVANT B5a prof a CACHÉ les corrections d''un devoir ; la même question est dans un autre devoir avec corrections : corrigé caché', 'S1', 'select count(*)::text from public.question_answer_key where question_id = ''' || (select v::text from ids where k='Q5') || '''', null, 'OK 1');
select pg_temp.t('AVANT B5b corrigé d''un devoir publié où l''élève a répondu : toujours visible', 'S1', 'select count(*)::text from public.question_answer_key where question_id = ''' || (select v::text from ids where k='Q6') || '''', null, 'OK 1');
select pg_temp.t('AVANT B7a prof : déplacer son devoir dans une autre de ses classes → refusé', 'T', 'update public.assignments set class_id = ''' || (select v::text from ids where k='C3') || ''' where id = ''' || (select v::text from ids where k='A1') || ''' returning ''fait''', 'select (class_id = ''' || (select v::text from ids where k='C3') || ''')::text from public.assignments where id = ''' || (select v::text from ids where k='A1') || '''', 'OK fait | true');
select pg_temp.t('AVANT B7b prof : changer le titre de son devoir → toujours possible', 'T', 'update public.assignments set title = ''TEST 52 renamed'' where id = ''' || (select v::text from ids where k='A1') || ''' returning title', null, 'OK TEST 52 renamed');
select pg_temp.t('AVANT B8a résultats publiés : un NOUVEAU candidat ne peut plus entrer avec le code', 'S3', 'select (public.join_exam((select c from codes where k = ''E5''))->>''name'')', null, 'OK TEST 52 publie');
select pg_temp.t('AVANT B8b résultats publiés : un candidat déjà inscrit garde l''accès', 'S1', 'select (public.join_exam((select c from codes where k = ''E5''))->>''name'')', null, 'OK TEST 52 publie');
select pg_temp.t('AVANT B8c examen ouvert : un nouveau candidat entre normalement', 'S3', 'select (public.join_exam((select c from codes where k = ''E''))->>''name'')', null, 'OK TEST 52 examen');
select pg_temp.t('AVANT S1 sans compte (anon) : sauvegarde refusée', 'ANON', 'select public.save_answer_drafts(''' || (select v::text from ids where k='AR') || ''', ''{}''::jsonb)::text', null, 'ERR');
select pg_temp.t('AVANT S2 élève NON inscrit : sauvegarde Writing refusée', 'S3', 'select public.save_writing_draft(''' || (select v::text from ids where k='SW') || ''', ''x'', 1)::text', null, 'ERR Not enrolled in this class');

-- 3. Le script 52 lui-même (avec ses 6 vérifications). S'il échoue, tout s'arrête.

-- ---------------------------------------------------------------------
-- 0. Garde-fou : la base doit être celle d'après le 51 (ou déjà passée
--    par ce script). Sinon : arrêt, rien n'est changé.
-- ---------------------------------------------------------------------
do $guard$
declare v text;
begin
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' into v;
  if v is distinct from '65c8a9cc3b90733a70e8768f6a232aa4' and v is distinct from 'd31e197f84969940d61f90281846a12e' then
    raise exception 'Les regles de securite ne sont pas celles attendues (empreinte %). Rien n''est change.', v;
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.save_answer_drafts(uuid,jsonb)'));
  if v is distinct from 'c6de1c32035fa21e0f79e02b2c1fddfd' and v is distinct from '64887330bea21d5d69e2de7bd79d6ee0' then
    raise exception 'save_answer_drafts n''est pas la version attendue (%). Rien n''est change.', v;
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.submit_student_answers(uuid,jsonb)'));
  if v is distinct from '5342af3466c4d0dcf929249bf8661fee' and v is distinct from 'bf72af2a89e038734719e131bab70e03' then
    raise exception 'submit_student_answers n''est pas la version attendue (%). Rien n''est change.', v;
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.save_writing_draft(uuid,text,integer)'));
  if v is distinct from '9e4281dd91c6463938a01652ba698b0d' and v is distinct from '36efdc1abadd9bc08e177eed2676a177' then
    raise exception 'save_writing_draft n''est pas la version attendue (%). Rien n''est change.', v;
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.exam_collect_papers(uuid,boolean)'));
  if v is distinct from '87f33c55f3104ce3944de5afcd66a858' and v is distinct from 'e0fe6cf66a03b3ac1217a6511bfd3e04' then
    raise exception 'exam_collect_papers n''est pas la version attendue (%). Rien n''est change.', v;
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.exam_uncollected_papers(uuid)'));
  if v is distinct from '403a0dfcfbcd589451e1b5371a01a14b' and v is distinct from 'a603ab17691a20ae16b6a2539a7f1860' then
    raise exception 'exam_uncollected_papers n''est pas la version attendue (%). Rien n''est change.', v;
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.collect_class_papers(uuid)'));
  if v is distinct from 'a04886f30ab662396614f8eff1473a3b' and v is distinct from '76c31c3b71c38a203e3409daeea4606d' then
    raise exception 'collect_class_papers n''est pas la version attendue (%). Rien n''est change.', v;
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.join_exam(text)'));
  if v is distinct from 'b8c7f7c7a56222bead906a32e7ee5300' and v is distinct from '49d4ab0696106642b3901e3351c02e20' then
    raise exception 'join_exam n''est pas la version attendue (%). Rien n''est change.', v;
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.assignment_class_lock()'));
  if v is not null and v is distinct from '52ea7397d66470f3149ca546e0004c75' then
    raise exception 'assignment_class_lock existe deja dans une autre version (%). Rien n''est change.', v;
  end if;
  if to_regclass('public.writing_grades') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'writing_grades' and column_name = 'task_feedback') then
    raise exception 'Le script 51 n''est pas en place. Rien n''est change.';
  end if;
end $guard$;

-- ---------------------------------------------------------------------
-- 1. save_answer_drafts (copie de secours Reading / Listening) : + gel (B1),
--    marge 2 min (B3). Le reste est identique.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_answer_drafts(p_assignment_id uuid, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student  uuid := auth.uid();
  v_type     text;
  v_limit    integer;
  v_session  uuid;
  v_released timestamptz;
  v_started  timestamptz;
  v_submitted timestamptz;
  v_class    uuid;
  v_kind     text;
  v_at       timestamptz;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;

  select a.type, a.time_limit_minutes into v_type, v_limit from assignments a where a.id = p_assignment_id;
  if v_type is null or v_type not in ('Reading', 'Listening') then
    raise exception 'Not a Reading or Listening paper';
  end if;

  select e.id, e.results_released_at into v_session, v_released
  from exam_session_items i join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;
  if v_session is null then
    -- NOUVEAU (49) : un devoir de classe ordinaire, pour un élève inscrit.
    select a.class_id, c.kind into v_class, v_kind
    from assignments a join classes c on c.id = a.class_id
    where a.id = p_assignment_id;
    if v_kind is distinct from 'class' then
      return jsonb_build_object('saved', false, 'reason', 'not_exam');
    end if;
    if not exists (select 1 from roster r where r.class_id = v_class and r.student_id = v_student) then
      raise exception 'Not enrolled in this class';
    end if;
  elsif not public.is_exam_candidate(v_session) then
    raise exception 'Not allowed';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'Invalid answers'; end if;
  if (select count(*) from jsonb_object_keys(p_answers)) > 500 or length(p_answers::text) > 200000 then
    raise exception 'Too many answers';
  end if;

  select started_at, submitted_at into v_started, v_submitted
  from exam_attempts where assignment_id = p_assignment_id and student_id = v_student;
  if v_started is null then return jsonb_build_object('saved', false, 'reason', 'not_started'); end if;
  if v_submitted is not null then return jsonb_build_object('saved', false, 'reason', 'submitted'); end if;
  if v_session is not null and (v_released is not null or not public.exam_is_open(v_session)) then
    return jsonb_build_object('saved', false, 'reason', 'closed');
  end if;
  -- NOUVEAU (52) : gelé par le surveillant → rien n'est enregistré tant que
  -- le prof n'a pas cliqué « Let back in ». La page réessaie toute seule.
  if v_session is not null and exists (select 1 from exam_incidents x
       where x.session_id = v_session and x.student_id = v_student and x.freezes and x.cleared_at is null) then
    return jsonb_build_object('saved', false, 'reason', 'frozen');
  end if;
  -- NOUVEAU (52) : 2 minutes de marge réseau après la fin (au lieu de 5).
  if v_limit is not null and now() > v_started + make_interval(mins => v_limit) + interval '2 minutes' then
    return jsonb_build_object('saved', false, 'reason', 'time');
  end if;

  insert into exam_answer_drafts (assignment_id, student_id, answers, updated_at)
  values (p_assignment_id, v_student, p_answers, now())
  on conflict (assignment_id, student_id) do update
    set answers = excluded.answers, updated_at = now()
  returning updated_at into v_at;

  -- NOUVEAU (50) : l'heure (du serveur) de cette sauvegarde.
  return jsonb_build_object('saved', true, 'at', v_at);
end $function$

;

-- ---------------------------------------------------------------------
-- 2. submit_student_answers (remise Reading / Listening) : + heure de fin
--    (B2), + gel → copie d'avant le gel (B1), marge 2 min (B3).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_student_answers(p_assignment_id uuid, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id uuid := auth.uid();
  v_class_id   uuid;
  v_limit      integer;
  v_started    timestamptz;
  v_submitted  timestamptz;
  v_key        text;
  v_value      jsonb;
  v_qid        uuid;
  v_grade      record;
  v_count      integer := 0;
  v_exam       record;
  v_had_copy   boolean;
  v_end        timestamptz;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select class_id, time_limit_minutes into v_class_id, v_limit
  from assignments where id = p_assignment_id;
  if v_class_id is null then
    raise exception 'Assignment not found';
  end if;

  if not exists (select 1 from roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Invalid answers';
  end if;
  if (select count(*) from jsonb_object_keys(p_answers)) > 500 or length(p_answers::text) > 200000 then
    raise exception 'Too many answers';
  end if;

  -- Avait-il DEJA une copie en cours avant cet appel ? La question doit
  -- etre posee ici, avant la ligne qui en cree une au besoin — c'est
  -- elle qui distingue "j'etais en train de composer" de "je n'ai
  -- jamais rien commence". On ne compare aucune heure : dans une meme
  -- transaction now() ne bouge pas, une comparaison d'horloge serait
  -- donc fragile. L'existence de la copie, elle, ne ment pas.
  select true into v_had_copy from exam_attempts
   where assignment_id = p_assignment_id and student_id = v_student_id;
  v_had_copy := coalesce(v_had_copy, false);

  -- The attempt row is locked for the whole submission, so two
  -- submissions at the same time can't both go through.
  insert into exam_attempts (assignment_id, student_id, started_at)
  values (p_assignment_id, v_student_id, now())
  on conflict (assignment_id, student_id) do nothing;

  select started_at, submitted_at into v_started, v_submitted
  from exam_attempts
  where assignment_id = p_assignment_id and student_id = v_student_id
  for update;

  if v_submitted is not null
     or exists (select 1 from student_answers sa where sa.assignment_id = p_assignment_id and sa.student_id = v_student_id) then
    raise exception 'Already submitted';
  end if;

  -- ------------------------------------------------------------------
  -- NOUVEAU. Si cette epreuve appartient a une session d'examen :
  --   - resultats publies  → l'examen est termine, plus aucun rendu ;
  --   - session fermee     → on n'accepte QUE les copies qui existaient
  --     deja avant cet appel. Celui qui ecrivait au moment du clic du
  --     prof garde son travail ; celui qui n'avait rien commence ne
  --     peut plus composer.
  -- ------------------------------------------------------------------
  select e.id, e.closed_at, e.closes_at, e.results_released_at into v_exam
  from exam_session_items i
  join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;

  if found then
    if v_exam.results_released_at is not null then
      raise exception 'This exam is over';
    end if;
    -- NOUVEAU (52) : « fermé » = bouton Close OU heure de fin passée
    -- (avant : seulement le bouton). Une copie déjà commencée garde
    -- 2 minutes de marge réseau après la fin, pas plus : ensuite le
    -- serveur ramasse sa copie de secours.
    if not public.exam_is_open(v_exam.id) then
      if not v_had_copy then
        raise exception 'This exam is closed';
      end if;
      v_end := least(v_exam.closed_at, v_exam.closes_at);
      if v_end is null or v_end > now() or now() > v_end + interval '2 minutes' then
        raise exception 'This exam is closed';
      end if;
    end if;
    -- NOUVEAU (52) : gelé par le surveillant → on remet la copie de secours
    -- enregistrée AVANT le gel, jamais ce que cet appel envoie.
    if exists (select 1 from exam_incidents x
               where x.session_id = v_exam.id and x.student_id = v_student_id
                 and x.freezes and x.cleared_at is null) then
      select coalesce(jsonb_object_agg(d.key, d.value), '{}'::jsonb) into p_answers
      from exam_answer_drafts x, jsonb_each(x.answers) d
      where x.assignment_id = p_assignment_id and x.student_id = v_student_id
        and exists (select 1 from assignment_questions aq join exam_sections s on s.id = aq.section_id
                    where s.assignment_id = p_assignment_id and aq.question_id::text = d.key);
    end if;
  end if;

  -- NOUVEAU (52) : 2 minutes de marge réseau après la fin (au lieu de 5).
  if v_limit is not null and now() > v_started + make_interval(mins => v_limit) + interval '2 minutes' then
    raise exception 'Time is over';
  end if;

  for v_key, v_value in select key, value from jsonb_each(p_answers) loop
    begin
      v_qid := v_key::uuid;
    exception when others then
      raise exception 'Invalid question';
    end;

    -- The question must really belong to THIS assignment.
    if not exists (
      select 1
      from assignment_questions aq
      join exam_sections s on s.id = aq.section_id
      where aq.question_id = v_qid and s.assignment_id = p_assignment_id
    ) then
      raise exception 'Question not in this assignment';
    end if;

    select * into v_grade from grade_student_answer(v_qid, v_value);

    insert into student_answers (assignment_id, student_id, question_id, response, is_correct, points_earned)
    values (p_assignment_id, v_student_id, v_qid, v_value, v_grade.is_correct, v_grade.points_earned);
    v_count := v_count + 1;
  end loop;

  update exam_attempts
     set submitted_at = now()
   where assignment_id = p_assignment_id and student_id = v_student_id;

  -- Only the number of answers is returned — never which ones are right.
  return jsonb_build_object('submitted', v_count);
end;
$function$

;

-- ---------------------------------------------------------------------
-- 3. save_writing_draft (Writing) : en examen, examen ouvert + épreuve
--    commencée (B2) + gel (B1) ; marge 2 min (B3).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_writing_draft(p_section_id uuid, p_content_html text, p_word_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id    uuid := auth.uid();
  v_assignment_id uuid;
  v_class_id      uuid;
  v_type          text;
  v_task          smallint;
  v_limit         integer;
  v_started       timestamptz;
  v_submitted     timestamptz;
  v_session       uuid;
  v_released      timestamptz;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select s.assignment_id, s.task_number, a.class_id, a.type, a.time_limit_minutes
    into v_assignment_id, v_task, v_class_id, v_type, v_limit
  from exam_sections s
  join assignments a on a.id = s.assignment_id
  where s.id = p_section_id;

  if v_assignment_id is null or v_type <> 'Writing' or v_task is null then
    raise exception 'Not a Writing task';
  end if;

  if not exists (select 1 from roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  if length(coalesce(p_content_html, '')) > 200000 then
    raise exception 'Text too long';
  end if;

  select submitted_at into v_submitted
  from writing_responses
  where section_id = p_section_id and student_id = v_student_id;
  if v_submitted is not null then
    return jsonb_build_object('saved', false, 'reason', 'submitted');
  end if;

  -- NOUVEAU (52) : une épreuve d'EXAMEN suit les mêmes règles que le
  -- Reading / Listening : examen ouvert (bouton Close et heure de fin),
  -- épreuve commencée, et rien pendant un gel (la page réessaie toute
  -- seule toutes les 5 secondes et enregistre dès que le prof libère).
  select e.id, e.results_released_at into v_session, v_released
  from exam_session_items i join exam_sessions e on e.id = i.session_id
  where i.assignment_id = v_assignment_id;
  if v_session is not null then
    if v_released is not null or not public.exam_is_open(v_session) then
      return jsonb_build_object('saved', false, 'reason', 'closed');
    end if;
    if not exists (select 1 from exam_attempts t
                   where t.assignment_id = v_assignment_id and t.student_id = v_student_id) then
      return jsonb_build_object('saved', false, 'reason', 'not_started');
    end if;
    if exists (select 1 from exam_incidents x
               where x.session_id = v_session and x.student_id = v_student_id
                 and x.freezes and x.cleared_at is null) then
      raise exception 'Frozen: wait for your teacher';
    end if;
  end if;

  if v_limit is not null then
    select started_at into v_started
    from exam_attempts
    where assignment_id = v_assignment_id and student_id = v_student_id;
    if v_started is null then
      return jsonb_build_object('saved', false, 'reason', 'not_started');
    end if;
    -- NOUVEAU (52) : 2 minutes de marge réseau après la fin (au lieu de 5).
    if now() > v_started + make_interval(mins => v_limit) + interval '2 minutes' then
      return jsonb_build_object('saved', false, 'reason', 'time');
    end if;
  end if;

  insert into writing_responses (assignment_id, section_id, student_id, content_html, word_count)
  values (v_assignment_id, p_section_id, v_student_id, coalesce(p_content_html, ''),
          greatest(0, least(coalesce(p_word_count, 0), 100000)))
  on conflict (section_id, student_id) do update
    set content_html = excluded.content_html,
        word_count   = excluded.word_count,
        updated_at   = now()
    where writing_responses.submitted_at is null;

  return jsonb_build_object('saved', true);
end;
$function$

;

-- ---------------------------------------------------------------------
-- 4. exam_collect_papers (ramassage d'examen) : 2 min au lieu de 5 (B3).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exam_collect_papers(p_session_id uuid, p_all boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_att   record;
  v_key   text;
  v_value jsonb;
  v_qid   uuid;
  v_ok    boolean;
  v_pts   numeric;
  v_count integer := 0;
begin
  for v_att in
    select a.assignment_id, a.student_id, p.type
    from exam_session_items i
    join assignments p   on p.id = i.assignment_id
    join exam_attempts a on a.assignment_id = i.assignment_id
    where i.session_id = p_session_id
      and a.submitted_at is null
      and p.type in ('Reading', 'Listening', 'Writing')
      and (p_all or (p.time_limit_minutes is not null
                     and now() > a.started_at + make_interval(mins => p.time_limit_minutes) + interval '2 minutes'))
    for update of a skip locked          -- une remise en cours au même instant garde la main
  loop
   -- Une copie qui poserait un problème imprévu est laissée pour le passage
   -- suivant : elle ne doit JAMAIS empêcher la fermeture pour toute la salle.
   begin
    if v_att.type in ('Reading', 'Listening') then
      -- Comme une remise normale : seulement si aucune réponse n'est déjà notée.
      if not exists (select 1 from student_answers sa
                     where sa.assignment_id = v_att.assignment_id and sa.student_id = v_att.student_id) then
        for v_key, v_value in
          select d.key, d.value
          from exam_answer_drafts x, jsonb_each(x.answers) d
          where x.assignment_id = v_att.assignment_id and x.student_id = v_att.student_id
        loop
          begin
            v_qid := v_key::uuid;
          exception when others then
            continue;                     -- une clé qui n'est pas une question : ignorée
          end;
          if exists (select 1 from assignment_questions aq join exam_sections s on s.id = aq.section_id
                     where aq.question_id = v_qid and s.assignment_id = v_att.assignment_id) then
            -- Une réponse mal formée (pas la forme attendue pour ce type de
            -- question) est gardée, comptée fausse, et ne bloque rien.
            begin
              select g.is_correct, g.points_earned into v_ok, v_pts from grade_student_answer(v_qid, v_value) g;
            exception when others then
              v_ok := false; v_pts := 0;
            end;
            insert into student_answers (assignment_id, student_id, question_id, response, is_correct, points_earned)
            values (v_att.assignment_id, v_att.student_id, v_qid, v_value, coalesce(v_ok, false), coalesce(v_pts, 0))
            on conflict (student_id, question_id) do nothing;
          end if;
        end loop;
      end if;
    else
      -- Writing : comme submit_writing — une tâche jamais tapée a quand même sa ligne (vide).
      insert into writing_responses (assignment_id, section_id, student_id)
      select v_att.assignment_id, s.id, v_att.student_id
      from exam_sections s
      where s.assignment_id = v_att.assignment_id and s.task_number is not null
      on conflict (section_id, student_id) do nothing;
      update writing_responses set submitted_at = now()
       where assignment_id = v_att.assignment_id and student_id = v_att.student_id and submitted_at is null;
    end if;

    update exam_attempts set submitted_at = now()
     where assignment_id = v_att.assignment_id and student_id = v_att.student_id and submitted_at is null;
    delete from exam_answer_drafts where assignment_id = v_att.assignment_id and student_id = v_att.student_id;
    v_count := v_count + 1;
   exception when others then
    null;                               -- ramassée au prochain passage
   end;
  end loop;

  -- Plus besoin des brouillons des copies déjà rendues par les étudiants.
  delete from exam_answer_drafts x
   using exam_session_items i, exam_attempts a
   where i.session_id = p_session_id and x.assignment_id = i.assignment_id
     and a.assignment_id = x.assignment_id and a.student_id = x.student_id and a.submitted_at is not null;

  return v_count;
end $function$

;

-- ---------------------------------------------------------------------
-- 5. exam_uncollected_papers (compte des copies à ramasser) : idem.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exam_uncollected_papers(p_session_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_all  boolean;
  v_left integer;
begin
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;

  -- Les memes copies que celles que le ramassage doit prendre :
  -- toutes si l'examen n'est plus ouvert ou publie, sinon celles dont
  -- le temps (+2 min, livraison 94) est fini.
  v_all := not public.exam_is_open(p_session_id)
           or exists (select 1 from exam_sessions e where e.id = p_session_id and e.results_released_at is not null);

  -- « skip locked » : une copie que l'etudiant est en train de remettre
  -- a cet instant n'est pas un echec — elle n'est pas comptee.
  select count(*) into v_left
  from (
    select 1
    from exam_session_items i
    join assignments p   on p.id = i.assignment_id
    join exam_attempts a on a.assignment_id = i.assignment_id
    where i.session_id = p_session_id
      and a.submitted_at is null
      and p.type in ('Reading', 'Listening', 'Writing')
      and (v_all or (p.time_limit_minutes is not null
                     and now() > a.started_at + make_interval(mins => p.time_limit_minutes) + interval '2 minutes'))
    for update of a skip locked
  ) as s;

  return v_left;
end $function$

;

-- ---------------------------------------------------------------------
-- 6. collect_class_papers (ramassage d'un devoir de classe) : idem.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.collect_class_papers(p_assignment_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_class   uuid;
  v_kind    text;
  v_type    text;
  v_limit   integer;
  v_teacher boolean;
  v_att     record;
  v_key     text;
  v_value   jsonb;
  v_qid     uuid;
  v_ok      boolean;
  v_pts     numeric;
  v_count   integer := 0;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select a.class_id, a.type, a.time_limit_minutes, c.kind into v_class, v_type, v_limit, v_kind
  from assignments a join classes c on c.id = a.class_id where a.id = p_assignment_id;
  if v_class is null then raise exception 'Assignment not found'; end if;
  if v_kind is distinct from 'class' or v_type not in ('Reading', 'Listening') or v_limit is null
     or exists (select 1 from exam_session_items i where i.assignment_id = p_assignment_id) then
    return 0;
  end if;
  v_teacher := public.is_class_teacher(v_class);
  if not v_teacher and not exists (select 1 from roster r where r.class_id = v_class and r.student_id = v_uid) then
    raise exception 'Not allowed';
  end if;

  for v_att in
    select a.student_id, a.started_at
    from exam_attempts a
    where a.assignment_id = p_assignment_id
      and a.submitted_at is null
      and now() > a.started_at + make_interval(mins => v_limit) + interval '2 minutes'
      and (v_teacher or a.student_id = v_uid)
      and exists (select 1 from roster r where r.class_id = v_class and r.student_id = a.student_id)
      and exists (select 1 from exam_answer_drafts x where x.assignment_id = a.assignment_id and x.student_id = a.student_id)
    for update of a skip locked
  loop
   begin
    if not exists (select 1 from student_answers sa
                   where sa.assignment_id = p_assignment_id and sa.student_id = v_att.student_id) then
      for v_key, v_value in
        select d.key, d.value
        from exam_answer_drafts x, jsonb_each(x.answers) d
        where x.assignment_id = p_assignment_id and x.student_id = v_att.student_id
      loop
        begin
          v_qid := v_key::uuid;
        exception when others then
          continue;
        end;
        if exists (select 1 from assignment_questions aq join exam_sections s on s.id = aq.section_id
                   where aq.question_id = v_qid and s.assignment_id = p_assignment_id) then
          begin
            select g.is_correct, g.points_earned into v_ok, v_pts from grade_student_answer(v_qid, v_value) g;
          exception when others then
            v_ok := false; v_pts := 0;
          end;
          insert into student_answers (assignment_id, student_id, question_id, response, is_correct, points_earned)
          values (p_assignment_id, v_att.student_id, v_qid, v_value, coalesce(v_ok, false), coalesce(v_pts, 0))
          on conflict (student_id, question_id) do nothing;
        end if;
      end loop;
    end if;
    update exam_attempts set submitted_at = v_att.started_at + make_interval(mins => v_limit)
     where assignment_id = p_assignment_id and student_id = v_att.student_id and submitted_at is null;
    delete from exam_answer_drafts where assignment_id = p_assignment_id and student_id = v_att.student_id;
    v_count := v_count + 1;
   exception when others then
    null;
   end;
  end loop;
  return v_count;
end $function$

;

-- ---------------------------------------------------------------------
-- 7. join_exam : plus de nouveau candidat après publication (B8).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_exam(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_session uuid; v_class uuid; v_name text; v_released timestamptz;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_code is null or length(trim(p_code)) < 4 or length(trim(p_code)) > 12 then
    raise exception 'Invalid code';
  end if;
  select e.id, e.container_class_id, e.name, e.results_released_at into v_session, v_class, v_name, v_released
  from exam_sessions e where upper(e.code) = upper(trim(p_code));
  if v_session is null then raise exception 'No exam found with that code'; end if;
  if not public.exam_is_open(v_session) then raise exception 'This exam is not open yet'; end if;
  -- NOUVEAU (52) : résultats publiés → plus de nouveau candidat (un candidat
  -- déjà inscrit garde l'accès à son examen, comme avant).
  if v_released is not null
     and not exists (select 1 from roster r where r.class_id = v_class and r.student_id = auth.uid()) then
    raise exception 'This exam is over';
  end if;

  insert into roster (class_id, student_id) values (v_class, auth.uid()) on conflict do nothing;
  return jsonb_build_object('session_id', v_session, 'name', v_name);
end $function$

;

-- ---------------------------------------------------------------------
-- 8. B7 : une épreuve ne change jamais de classe depuis le site.
-- ---------------------------------------------------------------------
create or replace function public.assignment_class_lock()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  -- Livraison 94 (B7) : une épreuve ne change jamais de classe depuis le
  -- site (aucun écran ne le fait). Avant, un prof invité d'un examen pouvait
  -- déplacer une épreuve — et ses réponses — dans une de ses classes.
  -- Les fonctions du serveur et l'éditeur SQL (admin) ne sont pas concernés.
  if current_user = 'authenticated' and new.class_id is distinct from old.class_id then
    raise exception 'A paper cannot be moved to another class';
  end if;
  return new;
end $function$;

revoke all on function public.assignment_class_lock() from public, anon, authenticated;
drop trigger if exists assignment_class_lock on public.assignments;
create trigger assignment_class_lock before update of class_id on public.assignments
  for each row execute function public.assignment_class_lock();

-- ---------------------------------------------------------------------
-- 9. B5 : le corrigé d'une question, seulement pour l'épreuve où l'élève y
--    a répondu (ajout de « sa.assignment_id = a.id »). Règle RESSERRÉE.
-- ---------------------------------------------------------------------
alter policy "students see answer key once released and allowed" on public.question_answer_key
  using ((EXISTS ( SELECT 1
   FROM (((student_answers sa
     JOIN assignment_questions aq ON ((aq.question_id = sa.question_id)))
     JOIN exam_sections es ON ((es.id = aq.section_id)))
     JOIN assignments a ON ((a.id = es.assignment_id)))
  WHERE ((sa.question_id = question_answer_key.question_id) AND (sa.student_id = (select auth.uid())) AND (sa.assignment_id = a.id) AND (a.show_answer_review = true) AND ((a.auto_release_score = true) OR (EXISTS ( SELECT 1
           FROM assignment_feedback af
          WHERE ((af.assignment_id = a.id) AND (af.student_id = (select auth.uid())) AND (af.released_at IS NOT NULL)))))))));

-- ---------------------------------------------------------------------
-- 10. Vérifications. Si une seule échoue : tout est annulé.
-- ---------------------------------------------------------------------
do $check$
declare v text; n int;
begin
  -- V1 : les fonctions sont exactement celles prévues, toujours protégées.
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.save_answer_drafts(uuid,jsonb)')) is distinct from '64887330bea21d5d69e2de7bd79d6ee0'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.submit_student_answers(uuid,jsonb)')) is distinct from 'bf72af2a89e038734719e131bab70e03'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.save_writing_draft(uuid,text,integer)')) is distinct from '36efdc1abadd9bc08e177eed2676a177'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.exam_collect_papers(uuid,boolean)')) is distinct from 'e0fe6cf66a03b3ac1217a6511bfd3e04'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.exam_uncollected_papers(uuid)')) is distinct from 'a603ab17691a20ae16b6a2539a7f1860'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.collect_class_papers(uuid)')) is distinct from '76c31c3b71c38a203e3409daeea4606d'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.join_exam(text)')) is distinct from '49d4ab0696106642b3901e3351c02e20'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.assignment_class_lock()')) is distinct from '52ea7397d66470f3149ca546e0004c75' then
    raise exception 'V1 : une fonction n''est pas la version prevue.';
  end if;
  select count(*) into n from pg_proc
   where proname in ('save_answer_drafts', 'submit_student_answers', 'save_writing_draft', 'exam_collect_papers', 'exam_uncollected_papers', 'collect_class_papers', 'join_exam') and pronamespace = 'public'::regnamespace
     and prosecdef and array_to_string(proconfig, ',') = 'search_path=public';
  if n <> 7 then raise exception 'V1 : securite des fonctions inattendue (% sur 7).', n; end if;

  -- V2 : droits inchangés : 6 fonctions pour authenticated, le ramassage
  -- d'examen pour personne ; la garde pour personne ; rien pour anon.
  select count(*) into n from pg_proc p
   where p.proname in ('save_answer_drafts', 'submit_student_answers', 'save_writing_draft', 'exam_collect_papers', 'exam_uncollected_papers', 'collect_class_papers', 'join_exam') and p.pronamespace = 'public'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'execute') = (p.proname <> 'exam_collect_papers')
     and not has_function_privilege('anon', p.oid, 'execute');
  if n <> 7 then raise exception 'V2 : droits inattendus (% sur 7).', n; end if;
  if has_function_privilege('authenticated', 'public.assignment_class_lock()'::regprocedure, 'execute')
     or has_function_privilege('anon', 'public.assignment_class_lock()'::regprocedure, 'execute') then
    raise exception 'V2 : la fonction de garde peut etre lancee.';
  end if;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  if n <> 0 then raise exception 'V2 : anon peut lancer % fonction(s).', n; end if;

  -- V3 : règles RLS = celles d'avant + la seule condition ajoutée (B5) ;
  -- RLS partout ; droits sur les tables inchangés ; rien pour anon.
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' into v;
  if v is distinct from 'd31e197f84969940d61f90281846a12e' then raise exception 'V3 : les regles ne sont pas celles prevues (%).', v; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception 'V3 : % table(s) sans RLS.', n; end if;
  select md5(string_agg(x, ' ' order by x collate "C")) from (select grantee||':'||table_name||':'||privilege_type x from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')) g into v;
  if v is distinct from '7285f854f83fe8df322356f91ce0fdb1' then raise exception 'V3 : les droits sur les tables ont change (%).', v; end if;
  select count(*) into n from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon';
  if n <> 0 then raise exception 'V3 : anon a % droit(s) sur des tables.', n; end if;

  -- V4 : la garde B7 est branchée sur assignments, active.
  select count(*) into n from pg_trigger
   where tgrelid = 'public.assignments'::regclass and tgname = 'assignment_class_lock'
     and tgfoid = 'public.assignment_class_lock()'::regprocedure and tgenabled = 'O';
  if n <> 1 then raise exception 'V4 : la garde B7 n''est pas en place.'; end if;

  -- V5 : la règle B5 contient bien la nouvelle condition.
  select count(*) into n from pg_policy
   where polrelid = 'public.question_answer_key'::regclass
     and polname = 'students see answer key once released and allowed'
     and pg_get_expr(polqual, polrelid) like '%(sa.assignment_id = a.id)%';
  if n <> 1 then raise exception 'V5 : la regle des corriges n''est pas celle prevue.'; end if;

  -- V6 : la table des copies de secours reste sans aucun droit direct.
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'exam_answer_drafts' and grantee in ('anon', 'authenticated');
  if n <> 0 then raise exception 'V6 : exam_answer_drafts a % droit(s) direct(s).', n; end if;

  raise notice '52 OK : 7 fonctions + 1 garde + 1 regle en place, 6 verifications passees.';
end $check$;
insert into res (step, got, expected) values ('Script 52 appliqué, 6 vérifications passées', 'OK', 'OK');

-- 4. Les 24 mêmes essais APRÈS le script 52.
select pg_temp.t('APRES B1a candidat GELÉ : sauvegarde Reading refusée (la page réessaiera après le gel)', 'S1', 'select (r->>''saved'') || '','' || coalesce(r->>''reason'',''-'') from (select public.save_answer_drafts(''' || (select v::text from ids where k='AR') || ''', ''{"' || (select v::text from ids where k='Q3') || '":"B"}''::jsonb) r) x', null, 'OK false,frozen');
select pg_temp.t('APRES B1b candidat GELÉ : sauvegarde Writing refusée (la page réessaiera après le gel)', 'S1', 'select public.save_writing_draft(''' || (select v::text from ids where k='SW') || ''', ''<p>pendant le gel</p>'', 3)::text', null, 'ERR Frozen: wait for your teacher');
select pg_temp.t('APRES B1c candidat GELÉ : la remise Reading garde la copie d''AVANT le gel (A), pas ce qui est envoyé (B)', 'S1', 'select public.submit_student_answers(''' || (select v::text from ids where k='AR') || ''', ''{"' || (select v::text from ids where k='Q3') || '":"B"}''::jsonb)::text', 'select response::text from public.student_answers where student_id = ''' || (select v::text from ids where k='S1') || ''' and question_id = ''' || (select v::text from ids where k='Q3') || '''', 'OK {"submitted": 1} | "A"');
select pg_temp.t('APRES B1d candidat GELÉ : la remise Writing marche (texte d''avant le gel)', 'S1', 'select public.submit_writing(''' || (select v::text from ids where k='AW') || ''')::text', 'select string_agg(content_html, ''|'') from public.writing_responses where student_id = ''' || (select v::text from ids where k='S1') || ''' and assignment_id = ''' || (select v::text from ids where k='AW') || '''', 'OK {"submitted": true} | <p>avant le gel</p>');
select pg_temp.t('APRES B1e candidat NON gelé : sauvegarde Reading normale', 'S2', 'select (r->>''saved'') from (select public.save_answer_drafts(''' || (select v::text from ids where k='AR') || ''', ''{"' || (select v::text from ids where k='Q3') || '":"B"}''::jsonb) r) x', null, 'OK true');
select pg_temp.t('APRES B1f candidat NON gelé : remise Reading normale (B gardé)', 'S2', 'select public.submit_student_answers(''' || (select v::text from ids where k='AR') || ''', ''{"' || (select v::text from ids where k='Q3') || '":"B"}''::jsonb)::text', 'select response::text from public.student_answers where student_id = ''' || (select v::text from ids where k='S2') || ''' and question_id = ''' || (select v::text from ids where k='Q3') || '''', 'OK {"submitted": 1} | "B"');
select pg_temp.t('APRES B2a heure de fin passée (10 min) : sauvegarde Writing d''examen refusée', 'S1', 'select public.save_writing_draft(''' || (select v::text from ids where k='SW2') || ''', ''<p>apres la fin</p>'', 3)::text', null, 'OK {"saved": false, "reason": "closed"}');
select pg_temp.t('APRES B2b heure de fin passée (10 min) : remise Reading refusée (le serveur ramasse la copie de secours)', 'S1', 'select public.submit_student_answers(''' || (select v::text from ids where k='AR2') || ''', ''{"' || (select v::text from ids where k='Q7') || '":"A"}''::jsonb)::text', null, 'ERR This exam is closed');
select pg_temp.t('APRES B2c heure de fin passée depuis 1 min : la remise passe encore (marge réseau)', 'S1', 'select public.submit_student_answers(''' || (select v::text from ids where k='AR3') || ''', ''{"' || (select v::text from ids where k='Q8') || '":"A"}''::jsonb)::text', null, 'OK {"submitted": 1}');
select pg_temp.t('APRES B2d examen ouvert, épreuve Writing PAS commencée : rien n''est enregistré', 'S2', 'select public.save_writing_draft(''' || (select v::text from ids where k='SW4') || ''', ''<p>sans commencer</p>'', 2)::text', null, 'OK {"saved": false, "reason": "not_started"}');
select pg_temp.t('APRES B2e examen ouvert, Writing commencé, pas gelé : sauvegarde normale', 'S2', 'select public.save_writing_draft(''' || (select v::text from ids where k='SW') || ''', ''<p>normal</p>'', 1)::text', null, 'OK {"saved": true}');
select pg_temp.t('APRES B3a devoir de 20 min commencé il y a 23 min : sauvegarde refusée (marge 2 min)', 'S1', 'select (r->>''saved'') || '','' || coalesce(r->>''reason'',''-'') from (select public.save_answer_drafts(''' || (select v::text from ids where k='A1') || ''', ''{"' || (select v::text from ids where k='Q1') || '":"B"}''::jsonb) r) x', null, 'OK false,time');
select pg_temp.t('APRES B3b devoir de 20 min commencé il y a 21 min : sauvegarde encore acceptée', 'S2', 'select (r->>''saved'') || '','' || coalesce(r->>''reason'',''-'') from (select public.save_answer_drafts(''' || (select v::text from ids where k='A1') || ''', ''{"' || (select v::text from ids where k='Q1') || '":"B"}''::jsonb) r) x', null, 'OK true,-');
select pg_temp.t('APRES B3c devoir de 20 min commencé il y a 23 min : remise refusée', 'S1', 'select public.submit_student_answers(''' || (select v::text from ids where k='A1') || ''', ''{"' || (select v::text from ids where k='Q1') || '":"B"}''::jsonb)::text', null, 'ERR Time is over');
select pg_temp.t('APRES B3d prof : ramassage du devoir (copie de secours, 23 min)', 'T', 'select public.collect_class_papers(''' || (select v::text from ids where k='A1') || ''')::text', 'select string_agg(response::text, '','') from public.student_answers where student_id = ''' || (select v::text from ids where k='S1') || ''' and question_id = ''' || (select v::text from ids where k='Q1') || '''', 'OK 1 | "C"');
select pg_temp.t('APRES B5a prof a CACHÉ les corrections d''un devoir ; la même question est dans un autre devoir avec corrections : corrigé caché', 'S1', 'select count(*)::text from public.question_answer_key where question_id = ''' || (select v::text from ids where k='Q5') || '''', null, 'OK 0');
select pg_temp.t('APRES B5b corrigé d''un devoir publié où l''élève a répondu : toujours visible', 'S1', 'select count(*)::text from public.question_answer_key where question_id = ''' || (select v::text from ids where k='Q6') || '''', null, 'OK 1');
select pg_temp.t('APRES B7a prof : déplacer son devoir dans une autre de ses classes → refusé', 'T', 'update public.assignments set class_id = ''' || (select v::text from ids where k='C3') || ''' where id = ''' || (select v::text from ids where k='A1') || ''' returning ''fait''', 'select (class_id = ''' || (select v::text from ids where k='C3') || ''')::text from public.assignments where id = ''' || (select v::text from ids where k='A1') || '''', 'ERR A paper cannot be moved to another class');
select pg_temp.t('APRES B7b prof : changer le titre de son devoir → toujours possible', 'T', 'update public.assignments set title = ''TEST 52 renamed'' where id = ''' || (select v::text from ids where k='A1') || ''' returning title', null, 'OK TEST 52 renamed');
select pg_temp.t('APRES B8a résultats publiés : un NOUVEAU candidat ne peut plus entrer avec le code', 'S3', 'select (public.join_exam((select c from codes where k = ''E5''))->>''name'')', null, 'ERR This exam is over');
select pg_temp.t('APRES B8b résultats publiés : un candidat déjà inscrit garde l''accès', 'S1', 'select (public.join_exam((select c from codes where k = ''E5''))->>''name'')', null, 'OK TEST 52 publie');
select pg_temp.t('APRES B8c examen ouvert : un nouveau candidat entre normalement', 'S3', 'select (public.join_exam((select c from codes where k = ''E''))->>''name'')', null, 'OK TEST 52 examen');
select pg_temp.t('APRES S1 sans compte (anon) : sauvegarde refusée', 'ANON', 'select public.save_answer_drafts(''' || (select v::text from ids where k='AR') || ''', ''{}''::jsonb)::text', null, 'ERR');
select pg_temp.t('APRES S2 élève NON inscrit : sauvegarde Writing refusée', 'S3', 'select public.save_writing_draft(''' || (select v::text from ids where k='SW') || ''', ''x'', 1)::text', null, 'ERR Not enrolled in this class');

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
