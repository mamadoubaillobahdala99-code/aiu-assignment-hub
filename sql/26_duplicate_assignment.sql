-- ============================================================================
-- 26_duplicate_assignment.sql — dupliquer un paper vers une classe OU un examen
--
-- AVANT : "Duplicate to another class" copiait le paper depuis le
-- navigateur, morceau par morceau. Une erreur au milieu laissait une copie
-- incomplete, sans rien dire. Et on ne pouvait pas copier vers un examen.
--
-- CE QUE FAIT CE FICHIER — deux fonctions :
--
-- 1) duplicate_targets() : la liste des destinations possibles pour moi
--      - mes classes ordinaires ;
--      - les examens dont je fais partie de l'equipe (createur OU invite),
--        seulement s'ils ne sont pas encore ouverts.
--
-- 2) duplicate_assignment(paper, destination) : la copie, EN UNE FOIS
--    (tout ou rien). Copie le devoir, ses parties, groupes, questions et
--    bonnes reponses. Jamais les reponses des etudiants ni les notes.
--    L'audio et les images ne sont pas recopies : la copie utilise les
--    memes fichiers (25_storage_file_usage.sql empeche de les supprimer
--    tant qu'une copie s'en sert).
--    Vers un examen : un Listening passe en "une seule ecoute" (audio
--    unique en mode examen, et 1 ecoute par partie si aucune limite).
--    Le paper est ajoute a la fin de la liste des papers de l'examen.
--
-- CE QUI EST VERIFIE PAR LA BASE (pas seulement par l'ecran)
--    - le paper d'origine est a moi, ou je suis dans l'equipe de son examen ;
--    - la destination est une de mes classes, ou un examen dont je fais
--      partie de l'equipe ;
--    - cet examen n'est ni ouvert, ni ferme, ni publie ;
--    - un etudiant ou un anonyme ne peut rien faire (pas de droit d'execution).
--
-- Aucune regle de securite existante n'est modifiee.
-- Ce script est re-executable sans danger.
-- ============================================================================

begin;

-- 1) Destinations possibles -------------------------------------------------
create or replace function public.duplicate_targets()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t order by t->>'kind', t->>'name'), '[]'::jsonb)
  from (
    select jsonb_build_object('class_id', c.id, 'name', c.name, 'kind', 'class', 'session_id', null) t
    from classes c
    where c.teacher_id = auth.uid() and c.kind = 'class'
    union all
    select jsonb_build_object('class_id', e.container_class_id, 'name', e.name, 'kind', 'exam', 'session_id', e.id)
    from exam_sessions e
    where public.is_exam_staff(e.id)
      and e.opened_at is null
      and e.closed_at is null
      and e.results_released_at is null
      and not public.exam_is_open(e.id)
  ) x;
$$;

-- 2) La copie ----------------------------------------------------------------
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

revoke all on function public.duplicate_targets() from public;
revoke all on function public.duplicate_targets() from anon;
grant execute on function public.duplicate_targets() to authenticated;
revoke all on function public.duplicate_assignment(uuid, uuid) from public;
revoke all on function public.duplicate_assignment(uuid, uuid) from anon;
grant execute on function public.duplicate_assignment(uuid, uuid) to authenticated;

commit;

-- ============================================================================
-- Pour revenir en arriere :
--   drop function if exists public.duplicate_assignment(uuid, uuid);
--   drop function if exists public.duplicate_targets();
-- ============================================================================
