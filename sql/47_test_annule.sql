-- =====================================================================
-- 47_test_annule.sql — TEST du script 47, dans une transaction ANNULÉE.
-- Rien n'est changé dans la base : la dernière ligne annule tout (message
-- « RESULTATS … »). À lancer AVANT 47_rls_speed.sql.
-- Ce qu'il prouve, compte par compte (Mamadou prof, Omar prof invite, autre prof, Bailo eleve, sans compte) :
--   pour CHAQUE table de public : les mêmes lignes visibles (nombre + empreinte),
--   les mêmes lignes modifiables et supprimables (essais annulés aussitôt),
--   les mêmes ajouts acceptés ou refusés — AVANT et APRÈS le script 47.
-- Attendu : « RESULTATS : N OK / 0 KO ».
-- =====================================================================
begin;
create temp table t47(phase text, who text, probe text, val text);
grant all on t47 to authenticated, anon;

-- Ce que voit / peut faire un compte (ou personne), table par table.
create or replace function pg_temp.probe(p_phase text, p_who text, p_uid uuid) returns void language plpgsql as $f$
declare r record; v text; n int; tbl text; col text; j jsonb; cols text;
  aid uuid := (select id from public.assignments order by id limit 1);
  cid uuid := (select id from public.classes where kind = 'class' order by id limit 1);
  sid uuid := (select id from public.assignments where type = 'Speaking' order by id limit 1);
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"authenticated"}' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
  for r in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r' and c.relname <> 't47' order by 1 loop
    tbl := r.relname;
    col := (select a.attname from pg_attribute a where a.attrelid = ('public.' || tbl)::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum limit 1);
    -- 1. what is visible
    begin
      set local role authenticated;
      execute format('select count(*)::text || '':'' || coalesce(md5(string_agg(t::text, ''|'' order by t::text)), ''-'') from public.%I t', tbl) into v;
      reset role;
    exception when others then reset role; v := 'ERR ' || sqlstate; end;
    insert into t47 values (p_phase, p_who, tbl || ' select', v);
    -- 2. what can be changed (no-op update), then cancelled
    begin
      set local role authenticated;
      execute format('update public.%I set %I = %I', tbl, col, col);
      get diagnostics n = row_count; v := n::text;
      reset role;
      raise exception using errcode = 'P0047';
    exception when sqlstate 'P0047' then reset role;
              when others then reset role; v := 'ERR ' || sqlstate;
    end;
    insert into t47 values (p_phase, p_who, tbl || ' update', v);
    -- 3. what can be deleted, then cancelled
    begin
      set local role authenticated;
      execute format('delete from public.%I', tbl);
      get diagnostics n = row_count; v := n::text;
      reset role;
      raise exception using errcode = 'P0047';
    exception when sqlstate 'P0047' then reset role;
              when others then reset role; v := 'ERR ' || sqlstate;
    end;
    insert into t47 values (p_phase, p_who, tbl || ' delete', v);
  end loop;
  -- 4. a few additions (accepted or refused), each cancelled
  for r in select * from (values
      ('classes', jsonb_build_object('name', 'T47', 'teacher_id', p_uid, 'code', 'T47XX', 'kind', 'class')),
      ('questions', jsonb_build_object('teacher_id', p_uid, 'type', 'gap_fill', 'skill', 'reading', 'prompt', 'x')),
      ('assignments', jsonb_build_object('class_id', cid, 'type', 'Reading', 'title', 'T47')),
      ('assignment_feedback', jsonb_build_object('assignment_id', aid, 'student_id', p_uid)),
      ('speaking_views', jsonb_build_object('assignment_id', coalesce(sid, aid), 'student_id', p_uid)),
      ('submissions', jsonb_build_object('assignment_id', aid, 'student_id', p_uid)),
      ('reading_highlights', jsonb_build_object('assignment_id', aid, 'student_id', p_uid)),
      ('roster', jsonb_build_object('class_id', cid, 'student_id', p_uid))
    ) x(t, j) loop
    select string_agg(quote_ident(k), ', ') into cols from jsonb_object_keys(r.j) k;
    begin
      set local role authenticated;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', r.t, cols, cols, r.t) using r.j;
      v := 'accepte';
      reset role;
      raise exception using errcode = 'P0047';
    exception when sqlstate 'P0047' then reset role;
              when others then reset role; v := 'refuse ' || sqlstate;
    end;
    insert into t47 values (p_phase, p_who, r.t || ' insert', v);
  end loop;
end $f$;
grant execute on function pg_temp.probe(text, text, uuid) to public;

-- Speed: the same reading 20 times (correct answers + a student's own answers).
create or replace function pg_temp.speed(p_uid uuid) returns numeric language plpgsql as $f$
declare t0 timestamptz; n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t0 := clock_timestamp();
  for i in 1..20 loop
    select count(*) into n from public.question_answer_key;
    select count(*) into n from public.student_answers;
    select count(*) into n from public.exam_attempts;
  end loop;
  reset role;
  return round(extract(epoch from clock_timestamp() - t0) * 1000 / 20, 1);
end $f$;
grant execute on function pg_temp.speed(uuid) to public;

do $avant$ begin
  perform pg_temp.probe('avant', 'Mamadou prof', '87781a4d-0e29-4e26-b268-a9d89235430a'::uuid);
  perform pg_temp.probe('avant', 'Omar prof invite', 'e6563fdf-9472-4d47-9543-069519f099ba'::uuid);
  perform pg_temp.probe('avant', 'autre prof', '4b9c6e52-7762-46fc-ad8e-08bd97ee4f39'::uuid);
  perform pg_temp.probe('avant', 'Bailo eleve', 'bb9f464b-62f2-414d-bdd3-d9c29b34a669'::uuid);
  perform pg_temp.probe('avant', 'sans compte', null);
end $avant$;
create temp table speed47(phase text, who text, ms numeric);
select pg_temp.speed('87781a4d-0e29-4e26-b268-a9d89235430a'::uuid), pg_temp.speed('bb9f464b-62f2-414d-bdd3-d9c29b34a669'::uuid);   -- warm-up, not counted
insert into speed47 select 'avant', 'Mamadou prof', pg_temp.speed('87781a4d-0e29-4e26-b268-a9d89235430a'::uuid);
insert into speed47 select 'avant', 'Bailo eleve', pg_temp.speed('bb9f464b-62f2-414d-bdd3-d9c29b34a669'::uuid);

-- ===================== LE SCRIPT 47 (sans begin / commit) =====================
-- ---------------------------------------------------------------------
-- 0. Garde-fou : les 62 règles de sécurité de public doivent être EXACTEMENT
--    celles d'aujourd'hui (empreinte 5647f84a7b5033a85a96a1870c7a5722), ou déjà passées par ce script.
--    Sinon : arrêt, rien n'est changé.
-- ---------------------------------------------------------------------
do $guard$
declare v text;
begin
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' into v;
  if v is distinct from '5647f84a7b5033a85a96a1870c7a5722' then
    raise exception 'Les regles de securite ne sont pas celles attendues (empreinte %). Rien n''est change.', v;
  end if;
end $guard$;

-- ---------------------------------------------------------------------
-- 1. Les index manquants (22) : une recherche plus rapide, aucun droit changé.
-- ---------------------------------------------------------------------
create index if not exists idx_assignment_feedback_student_id on public.assignment_feedback (student_id);
create index if not exists idx_classes_teacher_id on public.classes (teacher_id);
create index if not exists idx_exam_attempts_student_id on public.exam_attempts (student_id);
create index if not exists idx_exam_extra_time_assignment_id on public.exam_extra_time (assignment_id);
create index if not exists idx_exam_extra_time_student_id on public.exam_extra_time (student_id);
create index if not exists idx_exam_incidents_assignment_id on public.exam_incidents (assignment_id);
create index if not exists idx_exam_incidents_cleared_by on public.exam_incidents (cleared_by);
create index if not exists idx_exam_incidents_student_id on public.exam_incidents (student_id);
create index if not exists idx_exam_sessions_created_by on public.exam_sessions (created_by);
create index if not exists idx_listening_plays_section_id on public.listening_plays (section_id);
create index if not exists idx_listening_plays_student_id on public.listening_plays (student_id);
create index if not exists idx_questions_teacher_id on public.questions (teacher_id);
create index if not exists idx_reading_highlights_question_id on public.reading_highlights (question_id);
create index if not exists idx_reading_highlights_section_id on public.reading_highlights (section_id);
create index if not exists idx_reading_highlights_student_id on public.reading_highlights (student_id);
create index if not exists idx_roster_student_id on public.roster (student_id);
create index if not exists idx_speaking_views_student_id on public.speaking_views (student_id);
create index if not exists idx_student_answers_question_id on public.student_answers (question_id);
create index if not exists idx_submissions_student_id on public.submissions (student_id);
create index if not exists idx_teacher_requests_decided_by on public.teacher_requests (decided_by);
create index if not exists idx_writing_grades_student_id on public.writing_grades (student_id);
create index if not exists idx_writing_responses_student_id on public.writing_responses (student_id);

-- ---------------------------------------------------------------------
-- 2. Les 35 règles : la MÊME règle, mot pour mot, sauf auth.uid() écrit
--    (select auth.uid()) — « qui est connecté » est lu une fois par
--    requête au lieu d'une fois par ligne. Nom, commande (lire / ajouter /
--    modifier / supprimer) et rôles ne changent pas (alter policy).
-- ---------------------------------------------------------------------
alter policy "students read own released feedback" on public.assignment_feedback
  using (((student_id = (select auth.uid())) AND (released_at IS NOT NULL)));
alter policy "teachers manage feedback in own class" on public.assignment_feedback
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = assignment_feedback.assignment_id) AND (c.teacher_id = (select auth.uid()))))))
  with check ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = assignment_feedback.assignment_id) AND (c.teacher_id = (select auth.uid()))))));
alter policy "teacher manages own assignment_questions" on public.assignment_questions
  using ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = assignment_questions.question_id) AND (q.teacher_id = (select auth.uid()))))))
  with check ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = assignment_questions.question_id) AND (q.teacher_id = (select auth.uid()))))));
alter policy "teacher can create assignments in own class" on public.assignments
  with check ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = assignments.class_id) AND (c.teacher_id = (select auth.uid()))))));
alter policy "teacher can delete own assignments" on public.assignments
  using ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = assignments.class_id) AND (c.teacher_id = (select auth.uid()))))));
alter policy "classes readable by owner or member" on public.classes
  using (((teacher_id = (select auth.uid())) OR is_enrolled(id)));
alter policy "teacher deletes own class" on public.classes
  using ((teacher_id = (select auth.uid())));
alter policy "teachers can create classes" on public.classes
  with check ((((select auth.uid()) = teacher_id) AND is_teacher()));
alter policy "students read own attempts" on public.exam_attempts
  using ((student_id = (select auth.uid())));
alter policy "teachers read attempts in own classes" on public.exam_attempts
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = exam_attempts.assignment_id) AND (c.teacher_id = (select auth.uid()))))));
alter policy "incidents readable by owner or exam staff" on public.exam_incidents
  using (((student_id = (select auth.uid())) OR is_exam_staff(session_id)));
alter policy "teacher manages sections of own assignments" on public.exam_sections
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = exam_sections.assignment_id) AND (c.teacher_id = (select auth.uid()))))))
  with check ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = exam_sections.assignment_id) AND (c.teacher_id = (select auth.uid()))))));
alter policy "students read their own play counts" on public.listening_plays
  using (((select auth.uid()) = student_id));
alter policy "profiles readable by self or class members" on public.profiles
  using (((id = (select auth.uid())) OR shares_class_with(id)));
alter policy "users can update own profile" on public.profiles
  using (((select auth.uid()) = id));
alter policy "students see answer key once released and allowed" on public.question_answer_key
  using ((EXISTS ( SELECT 1
   FROM (((student_answers sa
     JOIN assignment_questions aq ON ((aq.question_id = sa.question_id)))
     JOIN exam_sections es ON ((es.id = aq.section_id)))
     JOIN assignments a ON ((a.id = es.assignment_id)))
  WHERE ((sa.question_id = question_answer_key.question_id) AND (sa.student_id = (select auth.uid())) AND (a.show_answer_review = true) AND ((a.auto_release_score = true) OR (EXISTS ( SELECT 1
           FROM assignment_feedback af
          WHERE ((af.assignment_id = a.id) AND (af.student_id = (select auth.uid())) AND (af.released_at IS NOT NULL)))))))));
alter policy "teacher manages own answer keys" on public.question_answer_key
  using ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = question_answer_key.question_id) AND (q.teacher_id = (select auth.uid()))))))
  with check ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = question_answer_key.question_id) AND (q.teacher_id = (select auth.uid()))))));
alter policy "teacher manages own question_groups" on public.question_groups
  using ((EXISTS ( SELECT 1
   FROM ((exam_sections s
     JOIN assignments a ON ((a.id = s.assignment_id)))
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((s.id = question_groups.section_id) AND (c.teacher_id = (select auth.uid()))))))
  with check ((EXISTS ( SELECT 1
   FROM ((exam_sections s
     JOIN assignments a ON ((a.id = s.assignment_id)))
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((s.id = question_groups.section_id) AND (c.teacher_id = (select auth.uid()))))));
alter policy "teacher manages own questions" on public.questions
  using ((teacher_id = (select auth.uid())))
  with check (((teacher_id = (select auth.uid())) AND is_teacher()));
alter policy "students manage their own highlights" on public.reading_highlights
  using (((select auth.uid()) = student_id))
  with check (((select auth.uid()) = student_id));
alter policy "roster readable by owner or teacher" on public.roster
  using (((student_id = (select auth.uid())) OR is_class_teacher(class_id)));
alter policy "student leaves or teacher removes" on public.roster
  using (((student_id = (select auth.uid())) OR is_class_teacher(class_id)));
alter policy "students read own speaking views" on public.speaking_views
  using ((student_id = (select auth.uid())));
alter policy "students record own speaking view" on public.speaking_views
  with check (((student_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM (assignments a
     JOIN roster r ON ((r.class_id = a.class_id)))
  WHERE ((a.id = speaking_views.assignment_id) AND (a.type = 'Speaking'::text) AND (r.student_id = (select auth.uid())))))));
alter policy "teachers read speaking views in own classes" on public.speaking_views
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = speaking_views.assignment_id) AND (c.teacher_id = (select auth.uid()))))));
alter policy "students see own answers once released" on public.student_answers
  using (((student_id = (select auth.uid())) AND answers_released(assignment_id)));
alter policy "teacher sees answers to own questions" on public.student_answers
  using ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = student_answers.question_id) AND (q.teacher_id = (select auth.uid()))))));
alter policy "students can submit own work" on public.submissions
  with check (((select auth.uid()) = student_id));
alter policy "students can update own submission" on public.submissions
  using (((select auth.uid()) = student_id));
alter policy "submissions readable by owner or teacher" on public.submissions
  using (((student_id = (select auth.uid())) OR is_assignment_teacher(assignment_id)));
alter policy "teachers can grade submissions in own class" on public.submissions
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = submissions.assignment_id) AND (c.teacher_id = (select auth.uid()))))));
alter policy "students read own released writing grades" on public.writing_grades
  using (((student_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM assignment_feedback f
  WHERE ((f.assignment_id = writing_grades.assignment_id) AND (f.student_id = (select auth.uid())) AND (f.released_at IS NOT NULL))))));
alter policy "teachers manage writing grades in own classes" on public.writing_grades
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = writing_grades.assignment_id) AND (c.teacher_id = (select auth.uid()))))))
  with check ((EXISTS ( SELECT 1
   FROM (((assignments a
     JOIN classes c ON ((c.id = a.class_id)))
     JOIN exam_sections s ON ((s.assignment_id = a.id)))
     JOIN roster r ON ((r.class_id = c.id)))
  WHERE ((a.id = writing_grades.assignment_id) AND (s.id = writing_grades.section_id) AND (r.student_id = writing_grades.student_id) AND (c.teacher_id = (select auth.uid()))))));
alter policy "students read own writing" on public.writing_responses
  using ((student_id = (select auth.uid())));
alter policy "teachers read writing in own classes" on public.writing_responses
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = writing_responses.assignment_id) AND (c.teacher_id = (select auth.uid()))))));

-- ---------------------------------------------------------------------
-- 3. Vérifications (dans la même transaction : si une échoue, tout est annulé)
-- ---------------------------------------------------------------------
do $verify$
declare v text; n int;
begin
  -- a) en remettant auth.uid() à la place de (select auth.uid()), on retrouve
  --    EXACTEMENT les 62 règles d'avant (même empreinte) : rien d'autre n'a bougé.
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' into v;
  if v is distinct from '5647f84a7b5033a85a96a1870c7a5722' then raise exception 'Verification a) : empreinte %', v; end if;
  -- b) plus aucune règle de public n'appelle auth.uid() directement.
  select count(*) into n from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public'
     and (regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') ~ 'auth\.uid\(\)'
       or regexp_replace(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''), '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') ~ 'auth\.uid\(\)');
  if n <> 0 then raise exception 'Verification b) : % regle(s) encore directes', n; end if;
  -- c) toujours 62 règles, RLS toujours active sur toutes les tables de public.
  select count(*) into n from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public';
  if n <> 62 then raise exception 'Verification c) : % regles au lieu de 62', n; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception 'Verification c) : % table(s) sans RLS', n; end if;
  -- d) les 22 index existent, chacun sur la bonne colonne.
  select count(*) into n from (values ('assignment_feedback','student_id'), ('classes','teacher_id'), ('exam_attempts','student_id'), ('exam_extra_time','assignment_id'), ('exam_extra_time','student_id'), ('exam_incidents','assignment_id'), ('exam_incidents','cleared_by'), ('exam_incidents','student_id'), ('exam_sessions','created_by'), ('listening_plays','section_id'), ('listening_plays','student_id'), ('questions','teacher_id'), ('reading_highlights','question_id'), ('reading_highlights','section_id'), ('reading_highlights','student_id'), ('roster','student_id'), ('speaking_views','student_id'), ('student_answers','question_id'), ('submissions','student_id'), ('teacher_requests','decided_by'), ('writing_grades','student_id'), ('writing_responses','student_id')) v(t, col)
   where exists (select 1 from pg_index i join pg_class ic on ic.oid = i.indexrelid
                 join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                 where i.indrelid = ('public.' || v.t)::regclass and a.attname = v.col and ic.relname = 'idx_' || v.t || '_' || v.col);
  if n <> 22 then raise exception 'Verification d) : % index sur 22', n; end if;
  raise notice 'Script 47 : 4 verifications OK';
end $verify$;

-- ==============================================================================

do $apres$ begin
  perform pg_temp.probe('apres', 'Mamadou prof', '87781a4d-0e29-4e26-b268-a9d89235430a'::uuid);
  perform pg_temp.probe('apres', 'Omar prof invite', 'e6563fdf-9472-4d47-9543-069519f099ba'::uuid);
  perform pg_temp.probe('apres', 'autre prof', '4b9c6e52-7762-46fc-ad8e-08bd97ee4f39'::uuid);
  perform pg_temp.probe('apres', 'Bailo eleve', 'bb9f464b-62f2-414d-bdd3-d9c29b34a669'::uuid);
  perform pg_temp.probe('apres', 'sans compte', null);
end $apres$;
select pg_temp.speed('87781a4d-0e29-4e26-b268-a9d89235430a'::uuid), pg_temp.speed('bb9f464b-62f2-414d-bdd3-d9c29b34a669'::uuid);   -- warm-up, not counted
insert into speed47 select 'apres', 'Mamadou prof', pg_temp.speed('87781a4d-0e29-4e26-b268-a9d89235430a'::uuid);
insert into speed47 select 'apres', 'Bailo eleve', pg_temp.speed('bb9f464b-62f2-414d-bdd3-d9c29b34a669'::uuid);

do $res$
declare ok int; ko int; total int; diffs text; sp text; vis int; dels int;
begin
  select count(*) filter (where a.val is not distinct from b.val), count(*) filter (where a.val is distinct from b.val), count(*),
         string_agg(case when a.val is distinct from b.val then a.who || ' / ' || a.probe || ' : ' || coalesce(a.val,'∅') || ' -> ' || coalesce(b.val,'∅') end, ' ; ')
    into ok, ko, total, diffs
    from t47 a join t47 b on b.phase = 'apres' and b.who = a.who and b.probe = a.probe where a.phase = 'avant';
  select count(*) into vis from t47 where phase = 'avant' and probe like '% select' and val not like '0:%' and val not like 'ERR%';
  select count(*) into dels from t47 where phase = 'avant' and probe like '% delete' and val ~ '^[1-9]';
  select string_agg(who || ' ' || phase || ' ' || ms || ' ms', ', ' order by who, phase desc) into sp from speed47;
  raise exception 'RESULTATS : % OK / % KO (sur % essais ; % lectures non vides, % suppressions possibles testees)% | vitesse (moyenne de 3 lectures) : % ',
    ok, ko, total, vis, dels, case when ko > 0 then ' | DIFFERENCES : ' || diffs else '' end, sp;
end $res$;
