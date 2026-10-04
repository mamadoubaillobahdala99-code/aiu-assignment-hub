-- =====================================================================
-- 47_rls_speed.sql — livraison 84 : la base plus rapide, sécurité IDENTIQUE
-- =====================================================================
-- Ce que fait ce script :
--   1. ajoute 22 index sur des colonnes de liaison (recherche plus rapide) ;
--   2. réécrit 35 règles RLS de public en remplaçant auth.uid() par
--      (select auth.uid()) — conseil officiel de Supabase (« auth_rls_initplan ») :
--      la valeur est la même, elle est seulement lue une fois par requête.
-- Ce qu'il ne fait PAS : aucune règle ajoutée, retirée ou élargie ; aucun droit
-- (GRANT) changé ; aucune donnée touchée ; anon toujours sans aucun droit.
-- Sécurité : tout est dans UNE transaction ; garde-fou au début (les règles
-- doivent être exactement celles d'aujourd'hui) ; 4 vérifications à la fin ;
-- si une seule échoue, rien n'est changé. Ré-exécutable sans risque.
-- Retour arrière : en bas du fichier, dans le bloc /* … */.
-- =====================================================================
begin;
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

commit;

/* =====================================================================
   RETOUR ARRIÈRE (seulement si besoin) : copier les lignes ENTRE « -- DÉBUT »
   et « -- FIN » (sans elles), les coller dans l'éditeur SQL, exécuter.
   Remet les 35 règles EXACTEMENT comme avant le script 47 et enlève les 22 index.
-- DÉBUT
begin;
alter policy "students read own released feedback" on public.assignment_feedback
  using (((student_id = auth.uid()) AND (released_at IS NOT NULL)));
alter policy "teachers manage feedback in own class" on public.assignment_feedback
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = assignment_feedback.assignment_id) AND (c.teacher_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = assignment_feedback.assignment_id) AND (c.teacher_id = auth.uid())))));
alter policy "teacher manages own assignment_questions" on public.assignment_questions
  using ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = assignment_questions.question_id) AND (q.teacher_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = assignment_questions.question_id) AND (q.teacher_id = auth.uid())))));
alter policy "teacher can create assignments in own class" on public.assignments
  with check ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = assignments.class_id) AND (c.teacher_id = auth.uid())))));
alter policy "teacher can delete own assignments" on public.assignments
  using ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = assignments.class_id) AND (c.teacher_id = auth.uid())))));
alter policy "classes readable by owner or member" on public.classes
  using (((teacher_id = auth.uid()) OR is_enrolled(id)));
alter policy "teacher deletes own class" on public.classes
  using ((teacher_id = auth.uid()));
alter policy "teachers can create classes" on public.classes
  with check (((auth.uid() = teacher_id) AND is_teacher()));
alter policy "students read own attempts" on public.exam_attempts
  using ((student_id = auth.uid()));
alter policy "teachers read attempts in own classes" on public.exam_attempts
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = exam_attempts.assignment_id) AND (c.teacher_id = auth.uid())))));
alter policy "incidents readable by owner or exam staff" on public.exam_incidents
  using (((student_id = auth.uid()) OR is_exam_staff(session_id)));
alter policy "teacher manages sections of own assignments" on public.exam_sections
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = exam_sections.assignment_id) AND (c.teacher_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = exam_sections.assignment_id) AND (c.teacher_id = auth.uid())))));
alter policy "students read their own play counts" on public.listening_plays
  using ((auth.uid() = student_id));
alter policy "profiles readable by self or class members" on public.profiles
  using (((id = auth.uid()) OR shares_class_with(id)));
alter policy "users can update own profile" on public.profiles
  using ((auth.uid() = id));
alter policy "students see answer key once released and allowed" on public.question_answer_key
  using ((EXISTS ( SELECT 1
   FROM (((student_answers sa
     JOIN assignment_questions aq ON ((aq.question_id = sa.question_id)))
     JOIN exam_sections es ON ((es.id = aq.section_id)))
     JOIN assignments a ON ((a.id = es.assignment_id)))
  WHERE ((sa.question_id = question_answer_key.question_id) AND (sa.student_id = auth.uid()) AND (a.show_answer_review = true) AND ((a.auto_release_score = true) OR (EXISTS ( SELECT 1
           FROM assignment_feedback af
          WHERE ((af.assignment_id = a.id) AND (af.student_id = auth.uid()) AND (af.released_at IS NOT NULL)))))))));
alter policy "teacher manages own answer keys" on public.question_answer_key
  using ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = question_answer_key.question_id) AND (q.teacher_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = question_answer_key.question_id) AND (q.teacher_id = auth.uid())))));
alter policy "teacher manages own question_groups" on public.question_groups
  using ((EXISTS ( SELECT 1
   FROM ((exam_sections s
     JOIN assignments a ON ((a.id = s.assignment_id)))
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((s.id = question_groups.section_id) AND (c.teacher_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM ((exam_sections s
     JOIN assignments a ON ((a.id = s.assignment_id)))
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((s.id = question_groups.section_id) AND (c.teacher_id = auth.uid())))));
alter policy "teacher manages own questions" on public.questions
  using ((teacher_id = auth.uid()))
  with check (((teacher_id = auth.uid()) AND is_teacher()));
alter policy "students manage their own highlights" on public.reading_highlights
  using ((auth.uid() = student_id))
  with check ((auth.uid() = student_id));
alter policy "roster readable by owner or teacher" on public.roster
  using (((student_id = auth.uid()) OR is_class_teacher(class_id)));
alter policy "student leaves or teacher removes" on public.roster
  using (((student_id = auth.uid()) OR is_class_teacher(class_id)));
alter policy "students read own speaking views" on public.speaking_views
  using ((student_id = auth.uid()));
alter policy "students record own speaking view" on public.speaking_views
  with check (((student_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (assignments a
     JOIN roster r ON ((r.class_id = a.class_id)))
  WHERE ((a.id = speaking_views.assignment_id) AND (a.type = 'Speaking'::text) AND (r.student_id = auth.uid()))))));
alter policy "teachers read speaking views in own classes" on public.speaking_views
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = speaking_views.assignment_id) AND (c.teacher_id = auth.uid())))));
alter policy "students see own answers once released" on public.student_answers
  using (((student_id = auth.uid()) AND answers_released(assignment_id)));
alter policy "teacher sees answers to own questions" on public.student_answers
  using ((EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = student_answers.question_id) AND (q.teacher_id = auth.uid())))));
alter policy "students can submit own work" on public.submissions
  with check ((auth.uid() = student_id));
alter policy "students can update own submission" on public.submissions
  using ((auth.uid() = student_id));
alter policy "submissions readable by owner or teacher" on public.submissions
  using (((student_id = auth.uid()) OR is_assignment_teacher(assignment_id)));
alter policy "teachers can grade submissions in own class" on public.submissions
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = submissions.assignment_id) AND (c.teacher_id = auth.uid())))));
alter policy "students read own released writing grades" on public.writing_grades
  using (((student_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM assignment_feedback f
  WHERE ((f.assignment_id = writing_grades.assignment_id) AND (f.student_id = auth.uid()) AND (f.released_at IS NOT NULL))))));
alter policy "teachers manage writing grades in own classes" on public.writing_grades
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = writing_grades.assignment_id) AND (c.teacher_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (((assignments a
     JOIN classes c ON ((c.id = a.class_id)))
     JOIN exam_sections s ON ((s.assignment_id = a.id)))
     JOIN roster r ON ((r.class_id = c.id)))
  WHERE ((a.id = writing_grades.assignment_id) AND (s.id = writing_grades.section_id) AND (r.student_id = writing_grades.student_id) AND (c.teacher_id = auth.uid())))));
alter policy "students read own writing" on public.writing_responses
  using ((student_id = auth.uid()));
alter policy "teachers read writing in own classes" on public.writing_responses
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = writing_responses.assignment_id) AND (c.teacher_id = auth.uid())))));
drop index if exists public.idx_assignment_feedback_student_id;
drop index if exists public.idx_classes_teacher_id;
drop index if exists public.idx_exam_attempts_student_id;
drop index if exists public.idx_exam_extra_time_assignment_id;
drop index if exists public.idx_exam_extra_time_student_id;
drop index if exists public.idx_exam_incidents_assignment_id;
drop index if exists public.idx_exam_incidents_cleared_by;
drop index if exists public.idx_exam_incidents_student_id;
drop index if exists public.idx_exam_sessions_created_by;
drop index if exists public.idx_listening_plays_section_id;
drop index if exists public.idx_listening_plays_student_id;
drop index if exists public.idx_questions_teacher_id;
drop index if exists public.idx_reading_highlights_question_id;
drop index if exists public.idx_reading_highlights_section_id;
drop index if exists public.idx_reading_highlights_student_id;
drop index if exists public.idx_roster_student_id;
drop index if exists public.idx_speaking_views_student_id;
drop index if exists public.idx_student_answers_question_id;
drop index if exists public.idx_submissions_student_id;
drop index if exists public.idx_teacher_requests_decided_by;
drop index if exists public.idx_writing_grades_student_id;
drop index if exists public.idx_writing_responses_student_id;
do $v$ declare v text; begin select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'   ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'   ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'   ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname)) from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' into v; if v is distinct from '5647f84a7b5033a85a96a1870c7a5722' then raise exception 'Retour arriere : empreinte %', v; end if; end $v$;
commit;
-- FIN
===================================================================== */
