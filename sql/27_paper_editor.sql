-- ============================================================================
-- 27_paper_editor.sql — modifier un paper Reading / Listening SANS le detruire
--
-- AVANT : "Edit assignment" effacait toutes les questions (et les reponses
-- des etudiants) puis recreait tout.
--
-- CE QUE FAIT CE FICHIER — deux fonctions :
--
-- 1) paper_edit_state(paper) : dans quelle situation est ce paper ?
--      niveau 1 — personne n'a rendu            : tout se modifie ;
--      niveau 2 — copies rendues, AUCUN etudiant
--                 n'a encore vu sa note          : textes + bonnes reponses
--                                                  (les copies sont renotees) ;
--      niveau 3 — au moins un etudiant a vu
--                 sa note                        : textes seulement.
--    "A vu sa note" = le paper montre la note des le rendu
--    (auto_release_score), OU le prof a publie la note de cet etudiant
--    (assignment_feedback.released_at), OU les resultats de l'examen sont
--    publies.
--
-- 2) save_paper_edits(paper, modifications) : enregistre EN UNE FOIS (tout
--    ou rien) uniquement ce qui a change, en gardant les memes questions :
--    les reponses deja rendues restent. Verifie, cote base :
--      - que c'est le prof proprietaire du paper ;
--      - que l'examen n'est pas en cours ;
--      - que chaque partie / groupe / question appartient bien a CE paper ;
--      - que la forme ne change pas : memes lettres de choix, meme nombre
--        de trous "___", memes blocs de notes/tableaux (seuls les TEXTES
--        changent) ;
--      - qu'une bonne reponse est valide pour son type ;
--      - la regle des 3 niveaux ci-dessus (niveau 3 : bonne reponse refusee).
--    Au niveau 2, chaque reponse d'etudiant a une question dont la bonne
--    reponse a change est renotee avec grade_student_answer (la meme
--    fonction que lors du rendu).
--
-- Aucune regle de securite existante n'est modifiee.
-- Ce script est re-executable sans danger.
-- ============================================================================

begin;

-- La "forme" d'un contenu JSON : tout pareil, sauf les textes, vides.
-- Les cles de structure (style, type, letter, label_set, kind) gardent
-- leur valeur : les changer changerait la forme.
create or replace function public.paper_json_shape(p jsonb, p_key text default null)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case jsonb_typeof(p)
    when 'object' then coalesce(
      (select jsonb_object_agg(k, public.paper_json_shape(v, k)) from jsonb_each(p) as e(k, v)),
      '{}'::jsonb)
    when 'array' then coalesce(
      (select jsonb_agg(public.paper_json_shape(v, p_key) order by i) from jsonb_array_elements(p) with ordinality as a(v, i)),
      '[]'::jsonb)
    when 'string' then
      case when p_key in ('style', 'type', 'letter', 'label_set', 'kind') then p else '""'::jsonb end
    else p
  end;
$$;

-- Nombre de trous (trois soulignes ou plus), comme dans l'application.
create or replace function public.paper_blank_count(p_text text)
returns integer
language sql
immutable
set search_path = public
as $$
  select count(*)::integer from regexp_matches(coalesce(p_text, ''), '_{3,}', 'g');
$$;

-- 1) Situation du paper ------------------------------------------------------
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

-- 2) Enregistrement -----------------------------------------------------------
-- p_edits = {
--   "sections":  [{ "id", "passage_title"?, "passage_text"? }],
--   "groups":    [{ "id", "instruction"?, "passage_text"? }],
--   "questions": [{ "id", "prompt"?, "options"?, "correct_answer"? }]
-- }  — seuls les champs presents sont modifies.
create or replace function public.save_paper_edits(p_assignment_id uuid, p_edits jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state    jsonb;
  v_level    integer;
  v_e        jsonb;
  v_id       uuid;
  v_old      record;
  v_new_text text;
  v_new_json jsonb;
  v_key      jsonb;
  v_old_key  jsonb;
  v_type     text;
  v_letters  text[];
  v_changed  integer := 0;
  v_keys     integer := 0;
  v_remarked integer := 0;
  v_ans      record;
  v_g        record;
begin
  v_state := public.paper_edit_state(p_assignment_id);   -- verifie aussi le proprietaire
  if (v_state->>'exam_live')::boolean then
    raise exception 'This exam is running: the paper cannot be changed now';
  end if;
  v_level := (v_state->>'level')::integer;

  if p_edits is null or jsonb_typeof(p_edits) <> 'object' or length(p_edits::text) > 500000 then
    raise exception 'Invalid edits';
  end if;

  -- Parties
  for v_e in select * from jsonb_array_elements(coalesce(p_edits->'sections', '[]'::jsonb)) loop
    v_id := (v_e->>'id')::uuid;
    select * into v_old from exam_sections where id = v_id and assignment_id = p_assignment_id;
    if not found then raise exception 'Part not in this paper'; end if;
    if v_e ? 'passage_text' and public.paper_blank_count(v_e->>'passage_text') <> public.paper_blank_count(v_old.passage_text) then
      raise exception 'A passage must keep the same number of blanks';
    end if;
    update exam_sections set
      passage_title = case when v_e ? 'passage_title' then nullif(left(v_e->>'passage_title', 300), '') else passage_title end,
      passage_text  = case when v_e ? 'passage_text'  then v_e->>'passage_text' else passage_text end
    where id = v_id;
    v_changed := v_changed + 1;
  end loop;

  -- Groupes
  for v_e in select * from jsonb_array_elements(coalesce(p_edits->'groups', '[]'::jsonb)) loop
    v_id := (v_e->>'id')::uuid;
    select g.* into v_old from question_groups g join exam_sections s on s.id = g.section_id
    where g.id = v_id and s.assignment_id = p_assignment_id;
    if not found then raise exception 'Question group not in this paper'; end if;
    if v_e ? 'passage_text' then
      v_new_text := v_e->>'passage_text';
      if public.paper_blank_count(v_new_text) <> public.paper_blank_count(v_old.passage_text) then
        raise exception 'A text with blanks must keep the same number of blanks';
      end if;
      -- Notes / tableau / formulaire... (JSON) : meme forme, seuls les textes changent.
      if left(ltrim(coalesce(v_old.passage_text, '')), 1) = '{' then
        begin
          v_new_json := v_new_text::jsonb;
        exception when others then
          raise exception 'The layout of this group was damaged';
        end;
        if public.paper_json_shape(v_new_json) <> public.paper_json_shape(v_old.passage_text::jsonb) then
          raise exception 'The layout of this group cannot change, only its words';
        end if;
      end if;
    end if;
    update question_groups set
      instruction  = case when v_e ? 'instruction' then nullif(v_e->>'instruction', '') else instruction end,
      passage_text = case when v_e ? 'passage_text' then v_e->>'passage_text' else passage_text end
    where id = v_id;
    v_changed := v_changed + 1;
  end loop;

  -- Questions
  for v_e in select * from jsonb_array_elements(coalesce(p_edits->'questions', '[]'::jsonb)) loop
    v_id := (v_e->>'id')::uuid;
    select q.* into v_old from questions q
    where q.id = v_id
      and exists (select 1 from assignment_questions aq join exam_sections s on s.id = aq.section_id
                  where aq.question_id = q.id and s.assignment_id = p_assignment_id);
    if not found then raise exception 'Question not in this paper'; end if;
    v_type := v_old.type;

    if v_e ? 'prompt' and public.paper_blank_count(v_e->>'prompt') <> public.paper_blank_count(v_old.prompt) then
      raise exception 'A question must keep the same number of blanks';
    end if;
    if v_e ? 'options' then
      if jsonb_typeof(v_e->'options') <> 'object'
         or public.paper_json_shape(v_e->'options') <> public.paper_json_shape(v_old.options) then
        raise exception 'The choices of a question cannot be added, removed or re-lettered, only reworded';
      end if;
    end if;
    update questions set
      prompt  = case when v_e ? 'prompt' then v_e->>'prompt' else prompt end,
      options = case when v_e ? 'options' then v_e->'options' else options end
    where id = v_id;
    v_changed := v_changed + 1;

    if v_e ? 'correct_answer' then
      v_key := v_e->'correct_answer';
      select correct_answer into v_old_key from question_answer_key where question_id = v_id;
      if v_old_key is distinct from v_key then
        if v_level = 3 then
          raise exception 'Some students have already seen their mark: the correct answers can no longer be changed';
        end if;
        select array_agg(c->>'letter') into v_letters
        from jsonb_array_elements(coalesce((select options from questions where id = v_id)->'choices', '[]'::jsonb)) c;

        if v_type = 'gap_fill' then
          if jsonb_typeof(v_key) <> 'array' or jsonb_array_length(v_key) < 1 or jsonb_array_length(v_key) > 10
             or exists (select 1 from jsonb_array_elements(v_key) x
                        where jsonb_typeof(x) <> 'string' or btrim(x #>> '{}') = '' or length(x #>> '{}') > 200) then
            raise exception 'A gap needs between 1 and 10 accepted answers';
          end if;
          select jsonb_agg(btrim(x #>> '{}')) into v_key from jsonb_array_elements(v_key) x;
        elsif v_type = 'multiple_selection' then
          if jsonb_typeof(v_key) <> 'array'
             or jsonb_array_length(v_key) <> jsonb_array_length(coalesce(v_old_key, '[]'::jsonb))
             or exists (select 1 from jsonb_array_elements_text(v_key) x where not (x = any(v_letters)))
             or (select count(distinct x) from jsonb_array_elements_text(v_key) x) <> jsonb_array_length(v_key) then
            raise exception 'Choose the same number of different correct letters';
          end if;
        elsif v_type = 'true_false_not_given' then
          if jsonb_typeof(v_key) <> 'string' or not ((v_key #>> '{}') = any (array['positive', 'negative', 'not_given'])) then
            raise exception 'Invalid answer';
          end if;
        else
          if jsonb_typeof(v_key) <> 'string' or not ((v_key #>> '{}') = any (v_letters)) then
            raise exception 'The correct answer must be one of the letters of this question';
          end if;
        end if;

        insert into question_answer_key (question_id, correct_answer) values (v_id, v_key)
        on conflict (question_id) do update set correct_answer = excluded.correct_answer;
        v_keys := v_keys + 1;

        -- Niveau 2 : on renote les copies deja rendues pour cette question.
        for v_ans in select id, response from student_answers where question_id = v_id loop
          select * into v_g from public.grade_student_answer(v_id, v_ans.response);
          update student_answers set is_correct = v_g.is_correct, points_earned = v_g.points_earned
          where id = v_ans.id;
          v_remarked := v_remarked + 1;
        end loop;
      end if;
    end if;
  end loop;

  return jsonb_build_object('changed', v_changed, 'keys_changed', v_keys, 'answers_remarked', v_remarked, 'level', v_level);
end $$;

revoke all on function public.paper_edit_state(uuid) from public;
revoke all on function public.paper_edit_state(uuid) from anon;
grant execute on function public.paper_edit_state(uuid) to authenticated;
revoke all on function public.save_paper_edits(uuid, jsonb) from public;
revoke all on function public.save_paper_edits(uuid, jsonb) from anon;
grant execute on function public.save_paper_edits(uuid, jsonb) to authenticated;
revoke all on function public.paper_json_shape(jsonb, text) from public;
revoke all on function public.paper_json_shape(jsonb, text) from anon;
grant execute on function public.paper_json_shape(jsonb, text) to authenticated;
revoke all on function public.paper_blank_count(text) from public;
revoke all on function public.paper_blank_count(text) from anon;
grant execute on function public.paper_blank_count(text) to authenticated;

commit;

-- ============================================================================
-- Pour revenir en arriere :
--   drop function if exists public.save_paper_edits(uuid, jsonb);
--   drop function if exists public.paper_edit_state(uuid);
--   drop function if exists public.paper_json_shape(jsonb, text);
--   drop function if exists public.paper_blank_count(text);
-- ============================================================================
