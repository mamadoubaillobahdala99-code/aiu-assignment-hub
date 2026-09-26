-- ============================================================================
-- 29_paper_editor_add_groups.sql — editeur de paper, etape 3
--
-- Remplace save_paper_edits (28_paper_editor_delete_media.sql) par une
-- version qui sait AUSSI AJOUTER des groupes de questions a une partie
-- existante — seulement au niveau 1 (personne n'a rendu ce paper). Des
-- qu'une copie est rendue : refuse (une nouvelle question compterait fausse
-- pour qui ne l'a jamais vue).
--
-- Comme a la creation d'un paper, les questions sont creees par les outils
-- de l'ecran (question par question, texte a trous, matching, carte...) ;
-- "Save changes" les RATTACHE au paper, a la fin de la partie choisie, EN
-- UNE FOIS avec toutes les autres modifications (tout ou rien).
--
-- VERIFIE COTE BASE pour chaque nouveau groupe :
--   - la partie appartient a ce paper ;
--   - 1 a 60 questions, sans doublon ;
--   - chaque question a ete creee par CE prof, n'est dans AUCUN paper, et a
--     sa bonne reponse ;
--   - l'image eventuelle vient du dossier du prof ;
--   - ensuite, les controles de fin deja en place : un "___" par question
--     dans un texte a trous, une image pour une carte, pas de groupe vide.
-- Tout le reste de 27 / 28 est garde a l'identique.
--
-- Aucune regle de securite existante n'est modifiee.
-- Ce script est re-executable sans danger.
-- ============================================================================

begin;

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
  v_deleted  integer := 0;
  v_ans      record;
  v_g        record;
  v_n        integer;
  v_val      text;
  v_added    integer := 0;
  v_qids     uuid[];
  v_gid      uuid;
begin
  v_state := public.paper_edit_state(p_assignment_id);   -- verifie aussi le proprietaire
  if (v_state->>'exam_live')::boolean then
    raise exception 'This exam is running: the paper cannot be changed now';
  end if;
  v_level := (v_state->>'level')::integer;

  if p_edits is null or jsonb_typeof(p_edits) <> 'object' or length(p_edits::text) > 500000 then
    raise exception 'Invalid edits';
  end if;

  -- ---------- Suppressions (niveau 1 seulement) ----------
  if jsonb_array_length(coalesce(p_edits->'delete_groups', '[]'::jsonb)) > 0
     or jsonb_array_length(coalesce(p_edits->'delete_questions', '[]'::jsonb)) > 0 then
    if v_level <> 1 then
      raise exception 'Questions can only be removed while nobody has handed in this paper';
    end if;

    for v_e in select * from jsonb_array_elements(coalesce(p_edits->'delete_groups', '[]'::jsonb)) loop
      v_id := (v_e #>> '{}')::uuid;
      if not exists (select 1 from question_groups g join exam_sections s on s.id = g.section_id
                     where g.id = v_id and s.assignment_id = p_assignment_id) then
        raise exception 'Question group not in this paper';
      end if;
      delete from questions q
      where q.id in (select aq.question_id from assignment_questions aq where aq.group_id = v_id);
      delete from assignment_questions where group_id = v_id;
      delete from question_groups where id = v_id;
      v_deleted := v_deleted + 1;
    end loop;

    for v_e in select * from jsonb_array_elements(coalesce(p_edits->'delete_questions', '[]'::jsonb)) loop
      v_id := (v_e #>> '{}')::uuid;
      if not exists (select 1 from assignment_questions aq join exam_sections s on s.id = aq.section_id
                     where aq.question_id = v_id and s.assignment_id = p_assignment_id) then
        raise exception 'Question not in this paper';
      end if;
      delete from assignment_questions where question_id = v_id;
      delete from questions where id = v_id;
      v_deleted := v_deleted + 1;
    end loop;
  end if;

  -- ---------- Nouveaux groupes (niveau 1 seulement) ----------
  -- Les questions ont deja ete creees par les outils de l'ecran de creation
  -- (comme quand on construit un paper) ; ici on les RATTACHE au paper.
  if jsonb_array_length(coalesce(p_edits->'add_groups', '[]'::jsonb)) > 0 then
    if v_level <> 1 then
      raise exception 'New questions can only be added while nobody has handed in this paper';
    end if;
    if jsonb_array_length(p_edits->'add_groups') > 20 then
      raise exception 'Too many new groups at once';
    end if;
    for v_e in select * from jsonb_array_elements(p_edits->'add_groups') loop
      v_id := (v_e->>'section_id')::uuid;
      if not exists (select 1 from exam_sections where id = v_id and assignment_id = p_assignment_id) then
        raise exception 'Part not in this paper';
      end if;
      if jsonb_typeof(v_e->'question_ids') <> 'array' then
        raise exception 'A new group needs its questions';
      end if;
      select array_agg((x #>> '{}')::uuid order by i) into v_qids
      from jsonb_array_elements(v_e->'question_ids') with ordinality as t(x, i);
      if coalesce(array_length(v_qids, 1), 0) = 0 or array_length(v_qids, 1) > 60 then
        raise exception 'A new group needs between 1 and 60 questions';
      end if;
      if (select count(distinct q) from unnest(v_qids) q) <> array_length(v_qids, 1) then
        raise exception 'The same question cannot be added twice';
      end if;
      if exists (
        select 1 from unnest(v_qids) as u(qid)
        where not exists (
          select 1 from questions q
          where q.id = u.qid
            and q.teacher_id = auth.uid()
            and q.type in ('gap_fill', 'multiple_choice', 'multiple_selection', 'true_false_not_given',
                           'matching_features', 'matching_information', 'matching_map_labelling',
                           'matching_headings', 'matching_sentence_endings'))
           or exists (select 1 from assignment_questions aq where aq.question_id = u.qid)
           or not exists (select 1 from question_answer_key k where k.question_id = u.qid)
      ) then
        raise exception 'A new question is not yours, is already in a paper, or has no correct answer';
      end if;
      v_val := nullif(v_e->>'image_url', '');
      if v_val is not null and not public.paper_own_file(v_val, 'images') then
        raise exception 'Upload the picture again from this screen';
      end if;
      v_new_text := nullif(v_e->>'passage_text', '');
      if v_new_text is not null and left(ltrim(v_new_text), 1) = '{' then
        begin
          v_new_json := v_new_text::jsonb;
        exception when others then
          raise exception 'The layout of the new group was damaged';
        end;
      end if;

      insert into question_groups (section_id, instruction, passage_text, image_url, order_index)
      values (v_id, nullif(left(coalesce(v_e->>'instruction', ''), 4000), ''), v_new_text, v_val,
              coalesce((select max(order_index) + 1 from question_groups where section_id = v_id), 0))
      returning id into v_gid;

      insert into assignment_questions (section_id, group_id, question_id, order_index)
      select v_id, v_gid, u.qid, (u.i - 1)::integer
      from unnest(v_qids) with ordinality as u(qid, i);
      v_added := v_added + 1;
    end loop;
  end if;

  -- ---------- Parties ----------
  for v_e in select * from jsonb_array_elements(coalesce(p_edits->'sections', '[]'::jsonb)) loop
    v_id := (v_e->>'id')::uuid;
    select * into v_old from exam_sections where id = v_id and assignment_id = p_assignment_id;
    if not found then raise exception 'Part not in this paper'; end if;
    if v_e ? 'passage_text' and public.paper_blank_count(v_e->>'passage_text') <> public.paper_blank_count(v_old.passage_text) then
      raise exception 'A passage must keep the same number of blanks';
    end if;
    if v_e ? 'audio_url' then
      v_val := v_e->>'audio_url';
      if v_val is not null and v_val is distinct from v_old.audio_url and not public.paper_own_file(v_val, 'audio') then
        raise exception 'Choose a recording from your own audio library';
      end if;
    end if;
    if v_e ? 'max_plays' and v_e->'max_plays' <> 'null'::jsonb then
      if jsonb_typeof(v_e->'max_plays') <> 'number' or (v_e->>'max_plays')::numeric not between 1 and 20
         or (v_e->>'max_plays')::numeric <> trunc((v_e->>'max_plays')::numeric) then
        raise exception 'Plays allowed must be a whole number between 1 and 20, or empty for unlimited';
      end if;
    end if;
    update exam_sections set
      passage_title = case when v_e ? 'passage_title' then nullif(left(v_e->>'passage_title', 300), '') else passage_title end,
      passage_text  = case when v_e ? 'passage_text'  then v_e->>'passage_text' else passage_text end,
      audio_url     = case when v_e ? 'audio_url'     then v_e->>'audio_url' else audio_url end,
      max_plays     = case when v_e ? 'max_plays'     then (v_e->>'max_plays')::integer else max_plays end
    where id = v_id;
    v_changed := v_changed + 1;
  end loop;

  -- ---------- Groupes ----------
  for v_e in select * from jsonb_array_elements(coalesce(p_edits->'groups', '[]'::jsonb)) loop
    v_id := (v_e->>'id')::uuid;
    select g.* into v_old from question_groups g join exam_sections s on s.id = g.section_id
    where g.id = v_id and s.assignment_id = p_assignment_id;
    if not found then raise exception 'Question group not in this paper'; end if;
    if v_e ? 'passage_text' then
      v_new_text := v_e->>'passage_text';
      if public.paper_blank_count(v_old.passage_text) = 0 and public.paper_blank_count(v_new_text) > 0 then
        raise exception 'Blanks cannot be added to this text';
      end if;
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
    if v_e ? 'image_url' then
      v_val := v_e->>'image_url';
      if v_val is not null and v_val is distinct from v_old.image_url and not public.paper_own_file(v_val, 'images') then
        raise exception 'Upload the picture again from this screen';
      end if;
    end if;
    update question_groups set
      instruction  = case when v_e ? 'instruction' then nullif(v_e->>'instruction', '') else instruction end,
      passage_text = case when v_e ? 'passage_text' then v_e->>'passage_text' else passage_text end,
      image_url    = case when v_e ? 'image_url' then v_e->>'image_url' else image_url end
    where id = v_id;
    v_changed := v_changed + 1;
  end loop;

  -- ---------- Questions (inchange depuis 27) ----------
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

        for v_ans in select id, response from student_answers where question_id = v_id loop
          select * into v_g from public.grade_student_answer(v_id, v_ans.response);
          update student_answers set is_correct = v_g.is_correct, points_earned = v_g.points_earned
          where id = v_ans.id;
          v_remarked := v_remarked + 1;
        end loop;
      end if;
    end if;
  end loop;

  -- ---------- Le paper doit rester coherent ----------
  if not exists (select 1 from exam_sections where assignment_id = p_assignment_id) then
    raise exception 'The paper must keep at least one part';
  end if;
  if exists (select 1 from exam_sections s where s.assignment_id = p_assignment_id
             and not exists (select 1 from question_groups g where g.section_id = s.id)) then
    raise exception 'Each part must keep at least one question group';
  end if;
  for v_g in
    select g.id, g.passage_text, g.image_url,
           (select count(*) from assignment_questions aq where aq.group_id = g.id) as n,
           exists (select 1 from assignment_questions aq join questions q on q.id = aq.question_id
                   where aq.group_id = g.id and q.type = 'matching_map_labelling') as labelling
    from question_groups g join exam_sections s on s.id = g.section_id
    where s.assignment_id = p_assignment_id
  loop
    if v_g.n = 0 then
      raise exception 'A question group cannot be left empty: remove the whole group instead';
    end if;
    v_n := public.paper_blank_count(v_g.passage_text);
    if v_n > 0 and v_n <> v_g.n then
      raise exception 'Each question of a text with blanks needs its own "___": % blanks for % questions', v_n, v_g.n;
    end if;
    if v_g.labelling and v_g.image_url is null then
      raise exception 'A map or plan labelling group needs its picture';
    end if;
  end loop;

  return jsonb_build_object('changed', v_changed, 'deleted', v_deleted, 'added', v_added, 'keys_changed', v_keys,
                            'answers_remarked', v_remarked, 'level', v_level);
end $$;

revoke all on function public.save_paper_edits(uuid, jsonb) from public;
revoke all on function public.save_paper_edits(uuid, jsonb) from anon;
grant execute on function public.save_paper_edits(uuid, jsonb) to authenticated;

commit;

-- ============================================================================
-- Pour revenir en arriere : re-executer 28_paper_editor_delete_media.sql
-- (il remet la version precedente de save_paper_edits).
-- ============================================================================
