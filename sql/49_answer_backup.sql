-- =====================================================================
-- 49_answer_backup.sql — livraison 88 : les réponses ne se perdent plus
-- =====================================================================
-- Ce que fait ce script :
--   1. save_answer_drafts : la copie de secours des réponses Reading /
--      Listening (envoyée par la page toutes les 5 s) marche aussi pour un
--      devoir de CLASSE, plus seulement en examen. Pour un examen : rien
--      ne change (mêmes vérifications, même ordre).
--   2. my_answer_drafts (nouvelle) : l'élève relit SA copie de secours, et
--      seulement la sienne, tant qu'elle n'est pas rendue — pour retrouver
--      ses réponses sur un autre ordinateur.
--   3. collect_class_papers (nouvelle) : un devoir de classe chronométré,
--      temps + 5 min fini, jamais rendu (coupure, panne) est rendu avec sa
--      copie de secours — par l'élève (la sienne) ou par le prof de la classe
--      (toutes). Jamais pour un examen. Heure de remise = fin du temps.
-- Ce qu'il ne fait PAS : aucune table, aucune règle RLS, aucun droit sur les
-- tables changés ; les 2 nouvelles fonctions : authenticated seulement,
-- jamais anon. Aucune donnée touchée.
-- Sécurité : UNE transaction ; garde-fou au début ; 4 vérifications à la
-- fin ; si une seule échoue, rien n'est changé. Ré-exécutable sans risque.
-- Retour arrière : en bas du fichier, dans le bloc /* … */.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0. Garde-fou : la base doit être celle d'aujourd'hui (ou déjà passée par
--    ce script). Sinon : arrêt, rien n'est changé.
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
  if v is distinct from '84c5d8a8f320335b66ff6d5e5832db39' and v is distinct from '7f8377818362011cd06120f46437d537' then
    raise exception 'save_answer_drafts n''est pas la version attendue (%). Rien n''est change.', v;
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.my_answer_drafts(uuid)'));
  if v is not null and v is distinct from 'cf0706892958dd5ee78857dc89c1f8e4' then
    raise exception 'my_answer_drafts existe deja dans une autre version (%). Rien n''est change.', v;
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.collect_class_papers(uuid)'));
  if v is not null and v is distinct from 'a04886f30ab662396614f8eff1473a3b' then
    raise exception 'collect_class_papers existe deja dans une autre version (%). Rien n''est change.', v;
  end if;
end $guard$;

-- ---------------------------------------------------------------------
-- 1. save_answer_drafts : la copie de secours des réponses (toutes les 5 s)
--    marche aussi pour un devoir Reading / Listening de CLASSE (avant :
--    seulement en examen). Pour un examen, rien ne change : mêmes
--    vérifications, dans le même ordre.
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
    set answers = excluded.answers, updated_at = now();

  return jsonb_build_object('saved', true);
end $function$;

-- ---------------------------------------------------------------------
-- 2. my_answer_drafts : l'élève relit SA copie de secours — seulement la
--    sienne, seulement tant qu'elle n'est pas rendue (et, pour un examen,
--    tant que l'examen est ouvert). Sert à retrouver ses réponses sur un
--    autre ordinateur.
-- ---------------------------------------------------------------------
create or replace function public.my_answer_drafts(p_assignment_id uuid)
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
  return (select d.answers from exam_answer_drafts d
          where d.assignment_id = p_assignment_id and d.student_id = v_student);
end $function$;

-- ---------------------------------------------------------------------
-- 3. collect_class_papers : un devoir Reading / Listening CHRONOMÉTRÉ de
--    classe dont le temps (+ 5 min de grâce) est fini, jamais rendu (coupure
--    internet, ordinateur éteint…) est rendu avec sa copie de secours.
--    - appelé par l'élève : seulement SA copie ;
--    - appelé par le prof de la classe : toutes les copies concernées.
--    Seulement s'il existe une copie de secours (sinon rien ne change).
--    L'heure de remise = la fin du temps. Jamais pour un examen (qui a déjà
--    son propre ramassage). Comme le ramassage d'examen : une copie qui pose
--    un problème est laissée pour la fois suivante.
-- ---------------------------------------------------------------------
create or replace function public.collect_class_papers(p_assignment_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
      and now() > a.started_at + make_interval(mins => v_limit + 5)
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
end $function$;

revoke all on function public.my_answer_drafts(uuid) from public, anon, authenticated;
grant execute on function public.my_answer_drafts(uuid) to authenticated;
revoke all on function public.collect_class_papers(uuid) from public, anon, authenticated;
grant execute on function public.collect_class_papers(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Vérifications. Si une seule échoue : tout est annulé.
-- ---------------------------------------------------------------------
do $check$
declare v text; n int;
begin
  -- V1 : les 3 fonctions sont exactement celles de ce script.
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.save_answer_drafts(uuid,jsonb)')) is distinct from '7f8377818362011cd06120f46437d537'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.my_answer_drafts(uuid)')) is distinct from 'cf0706892958dd5ee78857dc89c1f8e4'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.collect_class_papers(uuid)')) is distinct from 'a04886f30ab662396614f8eff1473a3b' then
    raise exception 'V1 : une fonction n''est pas la version prevue.';
  end if;
  select count(*) into n from pg_proc
   where proname in ('save_answer_drafts', 'my_answer_drafts', 'collect_class_papers')
     and pronamespace = 'public'::regnamespace
     and prosecdef and array_to_string(proconfig, ',') = 'search_path=public';
  if n <> 3 then raise exception 'V1 : securite des fonctions inattendue (% sur 3).', n; end if;

  -- V2 : droits : authenticated oui ; anon et public non.
  select count(*) into n from pg_proc p
   where p.proname in ('save_answer_drafts', 'my_answer_drafts', 'collect_class_papers')
     and p.pronamespace = 'public'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'execute')
     and not has_function_privilege('anon', p.oid, 'execute');
  if n <> 3 then raise exception 'V2 : droits inattendus (% sur 3).', n; end if;
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

  raise notice '49 OK : 3 fonctions en place, 4 verifications passees.';
end $check$;

commit;

select '49 OK — 4 vérifications passées' as resultat;


/* =====================================================================
   RETOUR ARRIÈRE (seulement pour revenir exactement à avant le 49)
   Copier depuis la ligne « -- DÉBUT » jusqu'à la ligne « -- FIN » dans
   l'éditeur SQL de Supabase, puis Run.
   =====================================================================
-- DÉBUT
begin;

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
    return jsonb_build_object('saved', false, 'reason', 'not_exam');
  end if;
  if not public.is_exam_candidate(v_session) then raise exception 'Not allowed'; end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'Invalid answers'; end if;
  if (select count(*) from jsonb_object_keys(p_answers)) > 500 or length(p_answers::text) > 200000 then
    raise exception 'Too many answers';
  end if;

  select started_at, submitted_at into v_started, v_submitted
  from exam_attempts where assignment_id = p_assignment_id and student_id = v_student;
  if v_started is null then return jsonb_build_object('saved', false, 'reason', 'not_started'); end if;
  if v_submitted is not null then return jsonb_build_object('saved', false, 'reason', 'submitted'); end if;
  if v_released is not null or not public.exam_is_open(v_session) then
    return jsonb_build_object('saved', false, 'reason', 'closed');
  end if;
  if v_limit is not null and now() > v_started + make_interval(mins => v_limit + 5) then
    return jsonb_build_object('saved', false, 'reason', 'time');
  end if;

  insert into exam_answer_drafts (assignment_id, student_id, answers, updated_at)
  values (p_assignment_id, v_student, p_answers, now())
  on conflict (assignment_id, student_id) do update
    set answers = excluded.answers, updated_at = now();

  return jsonb_build_object('saved', true);
end $function$;

drop function if exists public.my_answer_drafts(uuid);
drop function if exists public.collect_class_papers(uuid);

do $check$
begin
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.save_answer_drafts(uuid,jsonb)')) is distinct from '84c5d8a8f320335b66ff6d5e5832db39' then
    raise exception 'Retour arriere : save_answer_drafts inattendue. Rien n''est change.';
  end if;
  if to_regprocedure('public.my_answer_drafts(uuid)') is not null or to_regprocedure('public.collect_class_papers(uuid)') is not null then
    raise exception 'Retour arriere : une nouvelle fonction est encore la.';
  end if;
end $check$;

commit;
select 'Retour arrière du 49 : OK' as resultat;
-- FIN
*/
