-- =====================================================================
-- 42_paper_lock.sql — livraison 63
-- Un paper d'examen EN COURS ne peut plus être modifié ni supprimé, par
-- aucun chemin : ni en appelant la base directement, ni par les
-- fonctions de la base (l'éditeur « Edit », la duplication…).
--
-- UNE SEULE DÉFINITION, partout (fondée sur exam_not_started du 41) :
--   - examen COMMENCÉ : ouvert par le bouton OU par l'heure d'ouverture,
--     ou fermé, ou publié            = not exam_not_started(examen) ;
--   - examen EN COURS : commencé, pas fermé, pas publié, heure de fin pas
--     encore atteinte                = exam_running(examen).
--
-- CE QUE FAIT CE FICHIER
--   1. exam_running, paper_exam_running, paper_exam_started : les aides.
--   2. Pendant qu'un examen est EN COURS, la base refuse toute
--      modification de ses papers : le paper lui-même (durée, type, audio,
--      classe…), ses parties, groupes, liens aux questions, questions et
--      CORRIGÉS. Message : « This exam is running — close it before
--      changing its papers ». Seule exception : la case de publication des
--      notes, que le bouton « Publish » coche (auto_release_score).
--      Remplace les deux anciens déclencheurs (suppression seulement,
--      bouton Open seulement).
--   3. Supprimer un paper d'examen : refusé dès que l'examen a COMMENCÉ
--      (des copies peuvent exister). Supprimer tout l'examen fermé avec son
--      bouton « Delete » reste possible.
--   4. paper_edit_state (l'éditeur « Edit ») et duplicate_assignment
--      utilisent la même définition. save_paper_edits refusait déjà via
--      paper_edit_state ; le déclencheur le bloque aussi, en plus.
--   Après la fermeture (ou la publication), l'édition remarche.
--
-- Script complet et ré-exécutable. Attendu : 7 lignes « OK ».
-- Retour arrière : bloc tout en bas.
-- =====================================================================

begin;

-- 1. Les aides.
create or replace function public.exam_running(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.exam_not_started(p_session_id)
     and exists (select 1 from exam_sessions e
                 where e.id = p_session_id
                   and e.closed_at is null
                   and e.results_released_at is null
                   and (e.closes_at is null or now() < e.closes_at));
$$;

create or replace function public.paper_exam_running(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from exam_session_items i
                 where i.assignment_id = p_assignment_id and public.exam_running(i.session_id));
$$;

create or replace function public.paper_exam_started(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from exam_session_items i
                 where i.assignment_id = p_assignment_id and not public.exam_not_started(i.session_id));
$$;

revoke all on function public.exam_running(uuid) from public, anon;
revoke all on function public.paper_exam_running(uuid) from public, anon;
revoke all on function public.paper_exam_started(uuid) from public, anon;
grant execute on function public.exam_running(uuid) to authenticated;
grant execute on function public.paper_exam_running(uuid) to authenticated;
grant execute on function public.paper_exam_started(uuid) to authenticated;

-- 2 et 3. Le verrou, pour TOUS les chemins (y compris les fonctions de la base).
create or replace function public.exam_paper_content_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_paper uuid;
  v_papers uuid[];
begin
  if tg_table_name = 'assignments' then
    if tg_op = 'DELETE' then
      if public.paper_exam_started(old.id) then
        raise exception 'This exam has started — its papers can no longer be deleted';
      end if;
      return old;
    end if;
    -- UPDATE : seule la case de publication des notes peut changer
    -- pendant l'examen (bouton « Publish »).
    if (v_new - 'auto_release_score') is distinct from (v_old - 'auto_release_score')
       and (public.paper_exam_running(old.id) or public.paper_exam_running(new.id)) then
      raise exception 'This exam is running — close it before changing its papers';
    end if;
    return new;
  end if;

  -- Le(s) paper(s) concerné(s) par la ligne (avant et après modification).
  if tg_table_name = 'exam_sections' then
    v_papers := array[(v_old->>'assignment_id')::uuid, (v_new->>'assignment_id')::uuid];
  elsif tg_table_name in ('question_groups', 'assignment_questions') then
    select array_agg(s.assignment_id) into v_papers from exam_sections s
     where s.id in ((v_old->>'section_id')::uuid, (v_new->>'section_id')::uuid);
  elsif tg_table_name in ('questions', 'question_answer_key') then
    select array_agg(distinct s.assignment_id) into v_papers
      from assignment_questions aq join exam_sections s on s.id = aq.section_id
     where aq.question_id in (coalesce((v_old->>'question_id')::uuid, (v_old->>'id')::uuid),
                              coalesce((v_new->>'question_id')::uuid, (v_new->>'id')::uuid));
  end if;

  if v_papers is not null then
    foreach v_paper in array v_papers loop
      if v_paper is not null and public.paper_exam_running(v_paper) then
        raise exception 'This exam is running — close it before changing its papers';
      end if;
    end loop;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

revoke all on function public.exam_paper_content_guard() from public, anon, authenticated;

-- Les deux anciens déclencheurs (suppression seulement, bouton Open seulement)
-- sont remplacés.
drop trigger if exists guard_live_exam_questions on public.questions;
drop trigger if exists guard_live_exam_sections on public.exam_sections;

drop trigger if exists exam_paper_lock on public.assignments;
create trigger exam_paper_lock before update or delete on public.assignments
  for each row execute function public.exam_paper_content_guard();
drop trigger if exists exam_paper_lock on public.exam_sections;
create trigger exam_paper_lock before insert or update or delete on public.exam_sections
  for each row execute function public.exam_paper_content_guard();
drop trigger if exists exam_paper_lock on public.question_groups;
create trigger exam_paper_lock before insert or update or delete on public.question_groups
  for each row execute function public.exam_paper_content_guard();
drop trigger if exists exam_paper_lock on public.assignment_questions;
create trigger exam_paper_lock before insert or update or delete on public.assignment_questions
  for each row execute function public.exam_paper_content_guard();
drop trigger if exists exam_paper_lock on public.questions;
create trigger exam_paper_lock before update or delete on public.questions
  for each row execute function public.exam_paper_content_guard();
drop trigger if exists exam_paper_lock on public.question_answer_key;
create trigger exam_paper_lock before insert or update or delete on public.question_answer_key
  for each row execute function public.exam_paper_content_guard();

-- 4. L'éditeur et la duplication : la même définition.
create or replace function public.paper_edit_state(p_assignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a        record;
  v_sub      integer;
  v_seen     boolean;
  v_live     boolean;
  v_released boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select a.id, a.auto_release_score, c.teacher_id into v_a
  from assignments a join classes c on c.id = a.class_id
  where a.id = p_assignment_id;
  if not found or v_a.teacher_id is distinct from auth.uid() then
    raise exception 'Not allowed';
  end if;

  select count(*) into v_sub from (
    select student_id from student_answers where assignment_id = p_assignment_id
    union
    select student_id from exam_attempts where assignment_id = p_assignment_id and submitted_at is not null
  ) x;

  select exists (
    select 1 from exam_session_items i join exam_sessions e on e.id = i.session_id
    where i.assignment_id = p_assignment_id and e.results_released_at is not null
  ) into v_released;

  v_seen := v_sub > 0 and (
    coalesce(v_a.auto_release_score, false)
    or v_released
    or exists (select 1 from assignment_feedback f
               where f.assignment_id = p_assignment_id and f.released_at is not null)
  );

  -- NOUVEAU (42) : UNE seule définition de « examen en cours » partout
  -- (paper_exam_running, fondée sur exam_not_started du 41).
  v_live := public.paper_exam_running(p_assignment_id);

  return jsonb_build_object(
    'level', case when v_sub = 0 then 1 when v_seen then 3 else 2 end,
    'submitted', v_sub,
    'marks_seen', v_seen,
    'exam_live', v_live);
end $$;

create or replace function public.duplicate_assignment(p_assignment_id uuid, p_target_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src      record;
  v_target   record;
  v_session  uuid;
  v_to_exam  boolean;
  v_new_a    uuid;
  v_new_s    uuid;
  v_new_g    uuid;
  v_new_q    uuid;
  v_sec      record;
  v_grp      record;
  v_link     record;
  v_next     integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- Le paper d'origine : a moi, ou d'un examen dont je fais partie de l'equipe.
  select a.*, c.teacher_id as owner_id into v_src
  from assignments a join classes c on c.id = a.class_id
  where a.id = p_assignment_id;
  if not found then raise exception 'Paper not found'; end if;
  if v_src.owner_id is distinct from auth.uid()
     and not public.is_exam_staff_of_assignment(p_assignment_id) then
    raise exception 'Not allowed';
  end if;

  -- La destination.
  select * into v_target from classes where id = p_target_class_id;
  if not found then raise exception 'Destination not found'; end if;

  if v_target.kind = 'exam' then
    select e.id into v_session
    from exam_sessions e
    where e.container_class_id = v_target.id
      and public.is_exam_staff(e.id)
    limit 1;
    if v_session is null then raise exception 'Not allowed'; end if;
    -- NOUVEAU (42) : la même définition que partout (exam_not_started, 41).
    if not public.exam_not_started(v_session) then
      raise exception 'This exam has already started: papers can no longer be added';
    end if;
    v_to_exam := true;
  elsif v_target.kind = 'class' and v_target.teacher_id = auth.uid() then
    v_to_exam := false;
  else
    raise exception 'Not allowed';
  end if;

  insert into assignments (
    class_id, title, type, description, due_date, due_time, time_limit_minutes,
    target_word_count, image_url, reading_question_count, reading_questions_text,
    allow_audio_pause, auto_release_score, show_answer_review, reading_test_type,
    listening_audio_url, listening_exam_mode, listening_check_minutes)
  values (
    v_target.id, v_src.title, v_src.type, v_src.description, null, null,
    v_src.time_limit_minutes, v_src.target_word_count, v_src.image_url,
    v_src.reading_question_count, v_src.reading_questions_text, v_src.allow_audio_pause,
    v_src.auto_release_score, v_src.show_answer_review, v_src.reading_test_type,
    v_src.listening_audio_url,
    case when v_to_exam and v_src.listening_audio_url is not null then true else v_src.listening_exam_mode end,
    v_src.listening_check_minutes)
  returning id into v_new_a;

  for v_sec in select * from exam_sections where assignment_id = p_assignment_id order by order_index loop
    insert into exam_sections (
      assignment_id, title, order_index, passage_text, instruction, passage_title,
      audio_url, max_plays, image_url, task_number, speaking_part, documents)
    values (
      v_new_a, v_sec.title, v_sec.order_index, v_sec.passage_text, v_sec.instruction,
      v_sec.passage_title, v_sec.audio_url,
      case when v_to_exam and v_sec.audio_url is not null and v_sec.max_plays is null then 1 else v_sec.max_plays end,
      v_sec.image_url, v_sec.task_number, v_sec.speaking_part, v_sec.documents)
    returning id into v_new_s;

    for v_grp in select * from question_groups where section_id = v_sec.id order by order_index loop
      insert into question_groups (section_id, instruction, passage_text, order_index, image_url)
      values (v_new_s, v_grp.instruction, v_grp.passage_text, v_grp.order_index, v_grp.image_url)
      returning id into v_new_g;

      for v_link in
        select aq.order_index as pos, q.*
        from assignment_questions aq join questions q on q.id = aq.question_id
        where aq.group_id = v_grp.id
        order by aq.order_index
      loop
        insert into questions (teacher_id, type, skill, prompt, options, points)
        values (auth.uid(), v_link.type, v_link.skill, v_link.prompt, v_link.options, v_link.points)
        returning id into v_new_q;
        insert into question_answer_key (question_id, correct_answer)
        select v_new_q, k.correct_answer from question_answer_key k where k.question_id = v_link.id;
        insert into assignment_questions (section_id, group_id, question_id, order_index)
        values (v_new_s, v_new_g, v_new_q, v_link.pos);
      end loop;
    end loop;

    -- Filet : une question rattachee a la partie sans groupe.
    for v_link in
      select aq.order_index as pos, q.*
      from assignment_questions aq join questions q on q.id = aq.question_id
      where aq.section_id = v_sec.id and aq.group_id is null
      order by aq.order_index
    loop
      insert into questions (teacher_id, type, skill, prompt, options, points)
      values (auth.uid(), v_link.type, v_link.skill, v_link.prompt, v_link.options, v_link.points)
      returning id into v_new_q;
      insert into question_answer_key (question_id, correct_answer)
      select v_new_q, k.correct_answer from question_answer_key k where k.question_id = v_link.id;
      insert into assignment_questions (section_id, group_id, question_id, order_index)
      values (v_new_s, null, v_new_q, v_link.pos);
    end loop;
  end loop;

  if v_to_exam then
    select coalesce(max(order_index), 0) + 1 into v_next from exam_session_items where session_id = v_session;
    insert into exam_session_items (session_id, assignment_id, order_index)
    values (v_session, v_new_a, v_next);
  end if;

  return jsonb_build_object('assignment_id', v_new_a, 'class_id', v_target.id, 'session_id', v_session);
end $$;

commit;

-- ---------------------------------------------------------------------
-- CONTRÔLES (lecture seule) — chaque ligne doit afficher « OK »
-- ---------------------------------------------------------------------
select '1. le verrou est posé sur les 6 tables du paper' as controle,
       case when (select count(*) from pg_trigger where tgname = 'exam_paper_lock' and tgenabled = 'O'
                  and tgrelid in ('public.assignments'::regclass, 'public.exam_sections'::regclass, 'public.question_groups'::regclass,
                                  'public.assignment_questions'::regclass, 'public.questions'::regclass, 'public.question_answer_key'::regclass)) = 6
            then 'OK' else 'PROBLEME' end as resultat
union all
select '2. les anciens déclencheurs sont remplacés',
       case when not exists (select 1 from pg_trigger where tgname in ('guard_live_exam_questions', 'guard_live_exam_sections'))
            then 'OK' else 'PROBLEME' end
union all
select '3. une seule définition : exam_running repose sur exam_not_started',
       case when (select prosrc from pg_proc where oid = 'public.exam_running(uuid)'::regprocedure) like '%exam_not_started%'
             and (select prosrc from pg_proc where oid = 'public.paper_exam_started(uuid)'::regprocedure) like '%exam_not_started%'
            then 'OK' else 'PROBLEME' end
union all
select '4. l''éditeur (paper_edit_state) utilise paper_exam_running',
       case when (select prosrc from pg_proc where oid = 'public.paper_edit_state(uuid)'::regprocedure) like '%paper_exam_running%'
            then 'OK' else 'PROBLEME' end
union all
select '5. la duplication vers un examen utilise exam_not_started',
       case when (select prosrc from pg_proc where oid = 'public.duplicate_assignment(uuid, uuid)'::regprocedure) like '%exam_not_started(v_session)%'
            then 'OK' else 'PROBLEME' end
union all
select '6. nouvelles fonctions : security definer, search_path = public, jamais anon',
       case when (select count(*) from pg_proc
                  where oid in ('public.exam_running(uuid)'::regprocedure, 'public.paper_exam_running(uuid)'::regprocedure,
                                'public.paper_exam_started(uuid)'::regprocedure, 'public.exam_paper_content_guard()'::regprocedure)
                    and prosecdef and proconfig @> array['search_path=public']
                    and not has_function_privilege('anon', oid, 'execute')) = 4 then 'OK' else 'PROBLEME' end
union all
select '7. anon n''a toujours aucun droit sur les tables de public',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLEME' end;

/* =====================================================================
   RETOUR ARRIÈRE — remet paper_edit_state (27), duplicate_assignment (26)
   et les deux anciens déclencheurs du 16 ; supprime le verrou du 42.

begin;

drop trigger if exists exam_paper_lock on public.assignments;
drop trigger if exists exam_paper_lock on public.exam_sections;
drop trigger if exists exam_paper_lock on public.question_groups;
drop trigger if exists exam_paper_lock on public.assignment_questions;
drop trigger if exists exam_paper_lock on public.questions;
drop trigger if exists exam_paper_lock on public.question_answer_key;
drop function if exists public.exam_paper_content_guard();

create trigger guard_live_exam_questions
  before delete on public.questions
  for each row execute function public.exam_live_content_guard();
create trigger guard_live_exam_sections
  before delete on public.exam_sections
  for each row execute function public.exam_live_content_guard();

create or replace function public.paper_edit_state(p_assignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a        record;
  v_sub      integer;
  v_seen     boolean;
  v_live     boolean;
  v_released boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select a.id, a.auto_release_score, c.teacher_id into v_a
  from assignments a join classes c on c.id = a.class_id
  where a.id = p_assignment_id;
  if not found or v_a.teacher_id is distinct from auth.uid() then
    raise exception 'Not allowed';
  end if;

  select count(*) into v_sub from (
    select student_id from student_answers where assignment_id = p_assignment_id
    union
    select student_id from exam_attempts where assignment_id = p_assignment_id and submitted_at is not null
  ) x;

  select exists (
    select 1 from exam_session_items i join exam_sessions e on e.id = i.session_id
    where i.assignment_id = p_assignment_id and e.results_released_at is not null
  ) into v_released;

  v_seen := v_sub > 0 and (
    coalesce(v_a.auto_release_score, false)
    or v_released
    or exists (select 1 from assignment_feedback f
               where f.assignment_id = p_assignment_id and f.released_at is not null)
  );

  select exists (
    select 1 from exam_session_items i join exam_sessions e on e.id = i.session_id
    where i.assignment_id = p_assignment_id
      and ((e.opened_at is not null and e.closed_at is null) or public.exam_is_open(e.id))
  ) into v_live;

  return jsonb_build_object(
    'level', case when v_sub = 0 then 1 when v_seen then 3 else 2 end,
    'submitted', v_sub,
    'marks_seen', v_seen,
    'exam_live', v_live);
end $$;

create or replace function public.duplicate_assignment(p_assignment_id uuid, p_target_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src      record;
  v_target   record;
  v_session  uuid;
  v_to_exam  boolean;
  v_new_a    uuid;
  v_new_s    uuid;
  v_new_g    uuid;
  v_new_q    uuid;
  v_sec      record;
  v_grp      record;
  v_link     record;
  v_next     integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- Le paper d'origine : a moi, ou d'un examen dont je fais partie de l'equipe.
  select a.*, c.teacher_id as owner_id into v_src
  from assignments a join classes c on c.id = a.class_id
  where a.id = p_assignment_id;
  if not found then raise exception 'Paper not found'; end if;
  if v_src.owner_id is distinct from auth.uid()
     and not public.is_exam_staff_of_assignment(p_assignment_id) then
    raise exception 'Not allowed';
  end if;

  -- La destination.
  select * into v_target from classes where id = p_target_class_id;
  if not found then raise exception 'Destination not found'; end if;

  if v_target.kind = 'exam' then
    select e.id into v_session
    from exam_sessions e
    where e.container_class_id = v_target.id
      and public.is_exam_staff(e.id)
    limit 1;
    if v_session is null then raise exception 'Not allowed'; end if;
    if exists (select 1 from exam_sessions e
               where e.id = v_session
                 and (e.opened_at is not null or e.closed_at is not null
                      or e.results_released_at is not null or public.exam_is_open(e.id))) then
      raise exception 'This exam has already started: papers can no longer be added';
    end if;
    v_to_exam := true;
  elsif v_target.kind = 'class' and v_target.teacher_id = auth.uid() then
    v_to_exam := false;
  else
    raise exception 'Not allowed';
  end if;

  insert into assignments (
    class_id, title, type, description, due_date, due_time, time_limit_minutes,
    target_word_count, image_url, reading_question_count, reading_questions_text,
    allow_audio_pause, auto_release_score, show_answer_review, reading_test_type,
    listening_audio_url, listening_exam_mode, listening_check_minutes)
  values (
    v_target.id, v_src.title, v_src.type, v_src.description, null, null,
    v_src.time_limit_minutes, v_src.target_word_count, v_src.image_url,
    v_src.reading_question_count, v_src.reading_questions_text, v_src.allow_audio_pause,
    v_src.auto_release_score, v_src.show_answer_review, v_src.reading_test_type,
    v_src.listening_audio_url,
    case when v_to_exam and v_src.listening_audio_url is not null then true else v_src.listening_exam_mode end,
    v_src.listening_check_minutes)
  returning id into v_new_a;

  for v_sec in select * from exam_sections where assignment_id = p_assignment_id order by order_index loop
    insert into exam_sections (
      assignment_id, title, order_index, passage_text, instruction, passage_title,
      audio_url, max_plays, image_url, task_number, speaking_part, documents)
    values (
      v_new_a, v_sec.title, v_sec.order_index, v_sec.passage_text, v_sec.instruction,
      v_sec.passage_title, v_sec.audio_url,
      case when v_to_exam and v_sec.audio_url is not null and v_sec.max_plays is null then 1 else v_sec.max_plays end,
      v_sec.image_url, v_sec.task_number, v_sec.speaking_part, v_sec.documents)
    returning id into v_new_s;

    for v_grp in select * from question_groups where section_id = v_sec.id order by order_index loop
      insert into question_groups (section_id, instruction, passage_text, order_index, image_url)
      values (v_new_s, v_grp.instruction, v_grp.passage_text, v_grp.order_index, v_grp.image_url)
      returning id into v_new_g;

      for v_link in
        select aq.order_index as pos, q.*
        from assignment_questions aq join questions q on q.id = aq.question_id
        where aq.group_id = v_grp.id
        order by aq.order_index
      loop
        insert into questions (teacher_id, type, skill, prompt, options, points)
        values (auth.uid(), v_link.type, v_link.skill, v_link.prompt, v_link.options, v_link.points)
        returning id into v_new_q;
        insert into question_answer_key (question_id, correct_answer)
        select v_new_q, k.correct_answer from question_answer_key k where k.question_id = v_link.id;
        insert into assignment_questions (section_id, group_id, question_id, order_index)
        values (v_new_s, v_new_g, v_new_q, v_link.pos);
      end loop;
    end loop;

    -- Filet : une question rattachee a la partie sans groupe.
    for v_link in
      select aq.order_index as pos, q.*
      from assignment_questions aq join questions q on q.id = aq.question_id
      where aq.section_id = v_sec.id and aq.group_id is null
      order by aq.order_index
    loop
      insert into questions (teacher_id, type, skill, prompt, options, points)
      values (auth.uid(), v_link.type, v_link.skill, v_link.prompt, v_link.options, v_link.points)
      returning id into v_new_q;
      insert into question_answer_key (question_id, correct_answer)
      select v_new_q, k.correct_answer from question_answer_key k where k.question_id = v_link.id;
      insert into assignment_questions (section_id, group_id, question_id, order_index)
      values (v_new_s, null, v_new_q, v_link.pos);
    end loop;
  end loop;

  if v_to_exam then
    select coalesce(max(order_index), 0) + 1 into v_next from exam_session_items where session_id = v_session;
    insert into exam_session_items (session_id, assignment_id, order_index)
    values (v_session, v_new_a, v_next);
  end if;

  return jsonb_build_object('assignment_id', v_new_a, 'class_id', v_target.id, 'session_id', v_session);
end $$;

drop function if exists public.paper_exam_started(uuid);
drop function if exists public.paper_exam_running(uuid);
drop function if exists public.exam_running(uuid);

commit;

   ===================================================================== */
