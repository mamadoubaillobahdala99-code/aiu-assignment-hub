-- =====================================================================
-- 50_test_annule.sql — livraison 88c : TEST du script 50, puis TOUT est annulé
-- =====================================================================
-- À lancer AVANT 50_answer_sync.sql (le 49 doit déjà être en place), dans l'éditeur SQL de Supabase
-- (« Run without RLS » si on te le demande : c'est seulement l'éditeur).
-- Dans UNE transaction annulée à la fin :
--   1. crée une classe, un devoir chronométré (20 min, 2 questions) et un
--      examen ouvert de TEST, avec des comptes qui existent déjà (2 profs,
--      3 élèves) — rien n'est gardé ;
--   2. 11 essais AVANT le script 50 (à la place de ces comptes) ;
--   3. le script 50 lui-même (avec ses 4 vérifications) ;
--   4. les 11 essais APRÈS.
-- Résultat attendu : un message rouge « ERROR: RESULTATS : 23 OK / 0 KO »
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
-- 1. Données de test (comptes existants ; classe, devoir, examen créés ici).
-- ---------------------------------------------------------------------
do $setup$
declare
  t uuid; t2 uuid; s_in uuid; s_in2 uuid; s_out uuid;
  c1 uuid; c2 uuid; a1 uuid; a2 uuid; e uuid; sec1 uuid; sec2 uuid; g1 uuid; g2 uuid;
  q1 uuid; q2 uuid; q3 uuid;
begin
  select id into t  from public.profiles where role = 'teacher' order by created_at, id limit 1;
  select id into t2 from public.profiles where role = 'teacher' and id <> t order by created_at, id limit 1;
  select id into s_in  from public.profiles where role = 'student' order by created_at, id limit 1;
  select id into s_in2 from public.profiles where role = 'student' and id <> s_in order by created_at, id limit 1;
  select id into s_out from public.profiles where role = 'student' and id not in (s_in, s_in2) order by created_at, id limit 1;
  if t is null or t2 is null or s_in is null or s_in2 is null or s_out is null then
    raise exception 'Test impossible : il faut au moins 2 profs et 3 eleves dans la base.';
  end if;

  -- La classe et son devoir Reading de 20 minutes (2 questions).
  insert into public.classes (name, code, teacher_id, kind)
    values ('TEST 50 classe', 'T50' || substr(md5(random()::text), 1, 5), t, 'class') returning id into c1;
  insert into public.roster (class_id, student_id) values (c1, s_in), (c1, s_in2);
  insert into public.assignments (class_id, title, type, time_limit_minutes) values (c1, 'TEST 50 devoir', 'Reading', 20) returning id into a1;
  insert into public.exam_sections (assignment_id, title, order_index) values (a1, 'Part 1', 0) returning id into sec1;
  insert into public.question_groups (section_id, instruction, order_index) values (sec1, 'Choose A, B or C.', 0) returning id into g1;
  insert into public.questions (teacher_id, type, skill, prompt, options) values
    (t, 'multiple_choice', 'reading', 'Q1', '{"choices":[{"letter":"A","text":"a"},{"letter":"B","text":"b"},{"letter":"C","text":"c"}]}') returning id into q1;
  insert into public.questions (teacher_id, type, skill, prompt, options) values
    (t, 'multiple_choice', 'reading', 'Q2', '{"choices":[{"letter":"A","text":"a"},{"letter":"B","text":"b"},{"letter":"C","text":"c"}]}') returning id into q2;
  insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (sec1, q1, 0, g1), (sec1, q2, 1, g1);
  insert into public.question_answer_key (question_id, correct_answer) values (q1, '"B"'), (q2, '"C"');
  -- s_in vient de commencer ; s_in2 a commencé il y a 40 min (temps fini) et
  -- n'a jamais rendu : sa copie de secours existe (Q1 = B juste, Q2 = A faux).
  insert into public.exam_attempts (assignment_id, student_id, started_at) values (a1, s_in, now()), (a1, s_in2, now() - interval '40 minutes');
  insert into public.exam_answer_drafts (assignment_id, student_id, answers, updated_at)
    values (a1, s_in2, jsonb_build_object(q1::text, 'B', q2::text, 'A'), now() - interval '22 minutes');

  -- Un examen ouvert, avec une épreuve Reading commencée par s_in.
  insert into public.classes (name, code, teacher_id, kind)
    values ('TEST 50 examen', 'X50' || substr(md5(random()::text), 1, 5), t, 'exam') returning id into c2;
  insert into public.exam_sessions (name, code, container_class_id, created_by)
    values ('TEST 50 examen', 'E50' || substr(md5(random()::text), 1, 5), c2, t) returning id into e;
  insert into public.exam_session_staff (session_id, teacher_id, role) values (e, t, 'owner');
  insert into public.assignments (class_id, title, type, time_limit_minutes) values (c2, 'TEST 50 épreuve', 'Reading', 30) returning id into a2;
  insert into public.exam_session_items (session_id, assignment_id, order_index) values (e, a2, 0);
  insert into public.exam_sections (assignment_id, title, order_index) values (a2, 'Part 1', 0) returning id into sec2;
  insert into public.question_groups (section_id, instruction, order_index) values (sec2, 'Choose A, B or C.', 0) returning id into g2;
  insert into public.questions (teacher_id, type, skill, prompt, options) values
    (t, 'multiple_choice', 'reading', 'Q3', '{"choices":[{"letter":"A","text":"a"},{"letter":"B","text":"b"}]}') returning id into q3;
  insert into public.assignment_questions (section_id, question_id, order_index, group_id) values (sec2, q3, 0, g2);
  insert into public.question_answer_key (question_id, correct_answer) values (q3, '"A"');
  insert into public.roster (class_id, student_id) values (c2, s_in);
  update public.exam_sessions set opened_at = now() where id = e;
  insert into public.exam_attempts (assignment_id, student_id, started_at) values (a2, s_in, now());

  insert into ids values ('T', t), ('T2', t2), ('S_IN', s_in), ('S_IN2', s_in2), ('S_OUT', s_out),
                         ('A1', a1), ('A2', a2), ('Q1', q1), ('Q2', q2), ('Q3', q3), ('ANON', null);
end $setup$;

-- 2. Les 11 essais AVANT le script 50.
select pg_temp.t('AVANT S1 élève : sauvegarde d''un devoir de classe, l''heure du serveur est renvoyée', 'S_IN', 'select (r ? ''at'')::text || '','' || (r->>''saved'') from (select public.save_answer_drafts(''' || (select v::text from ids where k='A1') || ''', ''{"' || (select v::text from ids where k='Q1') || '":"A"}''::jsonb) r) x', null, 'OK false,true');
select pg_temp.t('AVANT S2 candidat : sauvegarde en examen (toujours possible, avec l''heure)', 'S_IN', 'select (r ? ''at'')::text || '','' || (r->>''saved'') from (select public.save_answer_drafts(''' || (select v::text from ids where k='A2') || ''', ''{"' || (select v::text from ids where k='Q3') || '":"A"}''::jsonb) r) x', null, 'OK false,true');
select pg_temp.t('AVANT S3 élève : lit l''heure et les réponses de SA copie', 'S_IN2', 'select (d->>''at'' is not null)::text || '','' || (d->''answers''->>''' || (select v::text from ids where k='Q1') || ''') || '','' || (d->''answers''->>''' || (select v::text from ids where k='Q2') || ''') from (select public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', null) d) x', null, 'ERR');
select pg_temp.t('AVANT S4 élève : copie plus récente que ce que son appareil connaît → réponses renvoyées', 'S_IN2', 'select coalesce(d->''answers''->>''' || (select v::text from ids where k='Q1') || ''', ''aucune'') from (select public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', now() - interval ''1 hour'') d) x', null, 'ERR');
select pg_temp.t('AVANT S5 élève : copie déjà connue de son appareil → pas de réponses renvoyées', 'S_IN2', 'select coalesce(d->''answers''->>''' || (select v::text from ids where k='Q1') || ''', ''aucune'') from (select public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', now() - interval ''22 minutes'') d) x', null, 'ERR');
select pg_temp.t('AVANT S6 autre élève de la classe : ne lit jamais la copie d''un autre', 'S_IN', 'select coalesce(public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', null)::text, ''rien'')', null, 'ERR');
select pg_temp.t('AVANT S7 élève NON inscrit : rien', 'S_OUT', 'select coalesce(public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', null)::text, ''rien'')', null, 'ERR');
select pg_temp.t('AVANT S8 prof de la classe : rien (ce n''est pas sa copie)', 'T', 'select coalesce(public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', null)::text, ''rien'')', null, 'ERR');
select pg_temp.t('AVANT S9 sans compte (anon) : refusé', 'ANON', 'select public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', null)::text', null, 'ERR');
select pg_temp.t('AVANT S10 my_answer_drafts du 49 : inchangée', 'S_IN2', 'select (d->>''' || (select v::text from ids where k='Q1') || ''') || '','' || (d->>''' || (select v::text from ids where k='Q2') || ''') from (select public.my_answer_drafts(''' || (select v::text from ids where k='A1') || ''') d) x', null, 'OK B,A');
select pg_temp.t('AVANT S11 élève NON inscrit : sauvegarde toujours refusée', 'S_OUT', 'select public.save_answer_drafts(''' || (select v::text from ids where k='A1') || ''', ''{"' || (select v::text from ids where k='Q1') || '":"A"}''::jsonb)::text', null, 'ERR');

-- 3. Le script 50 lui-même (avec ses 4 vérifications). S'il échoue, tout s'arrête.
-- ---------------------------------------------------------------------
-- 0. Garde-fou : la base doit être celle d'après le 49 (ou déjà passée
--    par ce script). Sinon : arrêt, rien n'est changé.
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
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.save_answer_drafts(uuid,jsonb)'));
  if v is distinct from '7f8377818362011cd06120f46437d537' and v is distinct from 'c6de1c32035fa21e0f79e02b2c1fddfd' then
    raise exception 'save_answer_drafts n''est pas la version attendue (%). Lancer d''abord le 49. Rien n''est change.', v;
  end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.my_answer_drafts(uuid)')) is distinct from 'cf0706892958dd5ee78857dc89c1f8e4' or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.collect_class_papers(uuid)')) is distinct from 'a04886f30ab662396614f8eff1473a3b' then
    raise exception 'Le script 49 n''est pas en place. Rien n''est change.';
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.my_answer_draft_state(uuid,timestamptz)'));
  if v is not null and v is distinct from '2948d288f144ede18e77b7acc5ff8bcc' then
    raise exception 'my_answer_draft_state existe deja dans une autre version (%). Rien n''est change.', v;
  end if;
end $guard$;

-- ---------------------------------------------------------------------
-- 1. save_answer_drafts : rien ne change, sauf qu'elle répond aussi
--    l'heure du serveur de la sauvegarde (« at »). Les anciennes pages
--    ignorent ce champ.
-- ---------------------------------------------------------------------
create or replace function public.save_answer_drafts(p_assignment_id uuid, p_answers jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if v_limit is not null and now() > v_started + make_interval(mins => v_limit + 5) then
    return jsonb_build_object('saved', false, 'reason', 'time');
  end if;

  insert into exam_answer_drafts (assignment_id, student_id, answers, updated_at)
  values (p_assignment_id, v_student, p_answers, now())
  on conflict (assignment_id, student_id) do update
    set answers = excluded.answers, updated_at = now()
  returning updated_at into v_at;

  -- NOUVEAU (50) : l'heure (du serveur) de cette sauvegarde.
  return jsonb_build_object('saved', true, 'at', v_at);
end $function$;

-- ---------------------------------------------------------------------
-- 2. my_answer_draft_state : la copie de secours de l'élève ET son heure.
--    Mêmes règles que my_answer_drafts (49) : seulement la sienne,
--    seulement tant qu'elle n'est pas rendue (et, pour un examen, tant
--    qu'il est ouvert). Avec p_since : les réponses ne sont renvoyées que
--    si la copie est PLUS RÉCENTE (un autre appareil a sauvegardé depuis).
-- ---------------------------------------------------------------------
create or replace function public.my_answer_draft_state(p_assignment_id uuid, p_since timestamptz default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_student   uuid := auth.uid();
  v_class     uuid;
  v_session   uuid;
  v_released  timestamptz;
  v_started   timestamptz;
  v_submitted timestamptz;
  v_answers   jsonb;
  v_at        timestamptz;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;
  select class_id into v_class from assignments where id = p_assignment_id;
  if v_class is null then return null; end if;
  if not exists (select 1 from roster r where r.class_id = v_class and r.student_id = v_student) then
    return null;
  end if;
  select started_at, submitted_at into v_started, v_submitted
  from exam_attempts where assignment_id = p_assignment_id and student_id = v_student;
  if v_started is null or v_submitted is not null then return null; end if;
  select e.id, e.results_released_at into v_session, v_released
  from exam_session_items i join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;
  if v_session is not null and (v_released is not null or not public.exam_is_open(v_session)) then
    return null;
  end if;
  select d.answers, d.updated_at into v_answers, v_at from exam_answer_drafts d
   where d.assignment_id = p_assignment_id and d.student_id = v_student;
  if v_at is null then return null; end if;
  return jsonb_build_object('at', v_at,
    'answers', case when p_since is null or v_at > p_since then v_answers else null end);
end $function$;

revoke all on function public.my_answer_draft_state(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.my_answer_draft_state(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Vérifications. Si une seule échoue : tout est annulé.
-- ---------------------------------------------------------------------
do $check$
declare v text; n int;
begin
  -- V1 : les fonctions sont exactement celles prévues.
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.save_answer_drafts(uuid,jsonb)')) is distinct from 'c6de1c32035fa21e0f79e02b2c1fddfd'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.my_answer_draft_state(uuid,timestamptz)')) is distinct from '2948d288f144ede18e77b7acc5ff8bcc'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.my_answer_drafts(uuid)')) is distinct from 'cf0706892958dd5ee78857dc89c1f8e4'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.collect_class_papers(uuid)')) is distinct from 'a04886f30ab662396614f8eff1473a3b' then
    raise exception 'V1 : une fonction n''est pas la version prevue.';
  end if;
  select count(*) into n from pg_proc
   where proname in ('save_answer_drafts', 'my_answer_draft_state')
     and pronamespace = 'public'::regnamespace
     and prosecdef and array_to_string(proconfig, ',') = 'search_path=public';
  if n <> 2 then raise exception 'V1 : securite des fonctions inattendue (% sur 2).', n; end if;

  -- V2 : droits : authenticated oui ; anon et public non.
  select count(*) into n from pg_proc p
   where p.proname in ('save_answer_drafts', 'my_answer_draft_state')
     and p.pronamespace = 'public'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'execute')
     and not has_function_privilege('anon', p.oid, 'execute');
  if n <> 2 then raise exception 'V2 : droits inattendus (% sur 2).', n; end if;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  if n <> 0 then raise exception 'V2 : anon peut lancer % fonction(s).', n; end if;

  -- V3 : règles RLS strictement inchangées ; RLS partout ; rien pour anon.
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'  into v;
  if v is distinct from '65c8a9cc3b90733a70e8768f6a232aa4' then raise exception 'V3 : les regles ont change (%).', v; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception 'V3 : % table(s) sans RLS.', n; end if;
  select count(*) into n from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon';
  if n <> 0 then raise exception 'V3 : anon a % droit(s) sur des tables.', n; end if;

  -- V4 : la table des copies de secours reste sans aucun droit direct.
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'exam_answer_drafts' and grantee in ('anon', 'authenticated');
  if n <> 0 then raise exception 'V4 : exam_answer_drafts a % droit(s) direct(s).', n; end if;

  raise notice '50 OK : 2 fonctions en place, 4 verifications passees.';
end $check$;
insert into res (step, got, expected) values ('Script 50 appliqué, 4 vérifications passées', 'OK', 'OK');

-- 4. Les 11 essais APRÈS le script 50.
select pg_temp.t('APRES S1 élève : sauvegarde d''un devoir de classe, l''heure du serveur est renvoyée', 'S_IN', 'select (r ? ''at'')::text || '','' || (r->>''saved'') from (select public.save_answer_drafts(''' || (select v::text from ids where k='A1') || ''', ''{"' || (select v::text from ids where k='Q1') || '":"A"}''::jsonb) r) x', null, 'OK true,true');
select pg_temp.t('APRES S2 candidat : sauvegarde en examen (toujours possible, avec l''heure)', 'S_IN', 'select (r ? ''at'')::text || '','' || (r->>''saved'') from (select public.save_answer_drafts(''' || (select v::text from ids where k='A2') || ''', ''{"' || (select v::text from ids where k='Q3') || '":"A"}''::jsonb) r) x', null, 'OK true,true');
select pg_temp.t('APRES S3 élève : lit l''heure et les réponses de SA copie', 'S_IN2', 'select (d->>''at'' is not null)::text || '','' || (d->''answers''->>''' || (select v::text from ids where k='Q1') || ''') || '','' || (d->''answers''->>''' || (select v::text from ids where k='Q2') || ''') from (select public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', null) d) x', null, 'OK true,B,A');
select pg_temp.t('APRES S4 élève : copie plus récente que ce que son appareil connaît → réponses renvoyées', 'S_IN2', 'select coalesce(d->''answers''->>''' || (select v::text from ids where k='Q1') || ''', ''aucune'') from (select public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', now() - interval ''1 hour'') d) x', null, 'OK B');
select pg_temp.t('APRES S5 élève : copie déjà connue de son appareil → pas de réponses renvoyées', 'S_IN2', 'select coalesce(d->''answers''->>''' || (select v::text from ids where k='Q1') || ''', ''aucune'') from (select public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', now() - interval ''22 minutes'') d) x', null, 'OK aucune');
select pg_temp.t('APRES S6 autre élève de la classe : ne lit jamais la copie d''un autre', 'S_IN', 'select coalesce(public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', null)::text, ''rien'')', null, 'OK rien');
select pg_temp.t('APRES S7 élève NON inscrit : rien', 'S_OUT', 'select coalesce(public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', null)::text, ''rien'')', null, 'OK rien');
select pg_temp.t('APRES S8 prof de la classe : rien (ce n''est pas sa copie)', 'T', 'select coalesce(public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', null)::text, ''rien'')', null, 'OK rien');
select pg_temp.t('APRES S9 sans compte (anon) : refusé', 'ANON', 'select public.my_answer_draft_state(''' || (select v::text from ids where k='A1') || ''', null)::text', null, 'ERR');
select pg_temp.t('APRES S10 my_answer_drafts du 49 : inchangée', 'S_IN2', 'select (d->>''' || (select v::text from ids where k='Q1') || ''') || '','' || (d->>''' || (select v::text from ids where k='Q2') || ''') from (select public.my_answer_drafts(''' || (select v::text from ids where k='A1') || ''') d) x', null, 'OK B,A');
select pg_temp.t('APRES S11 élève NON inscrit : sauvegarde toujours refusée', 'S_OUT', 'select public.save_answer_drafts(''' || (select v::text from ids where k='A1') || ''', ''{"' || (select v::text from ids where k='Q1') || '":"A"}''::jsonb)::text', null, 'ERR');

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
