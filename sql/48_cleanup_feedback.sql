-- =====================================================================
-- 48_cleanup_feedback.sql — livraison 86 : nettoyage de la base + feedback
-- =====================================================================
-- Ce que fait ce script :
--   1. supprime l'ANCIEN système de rendu, remplacé depuis longtemps
--      (vide, plus utilisé par le site) :
--        - la table public.submissions (et ses 4 règles, son déclencheur,
--          ses index — ils partent avec elle) ;
--        - la fonction submissions_guard() (le déclencheur de cette table) ;
--        - la fonction submit_student_answer(uuid, uuid, jsonb) (ancienne
--          remise question par question, déjà fermée à tous les comptes).
--      Garde is_assignment_teacher() : la règle de listening_plays s'en sert.
--   2. resserre assignment_feedback (score, band, commentaire d'une copie) :
--      un prof, ou un prof d'examen, ne peut plus CRÉER ni MODIFIER une note
--      que pour un élève INSCRIT dans la classe du devoir. Avant, il pouvait
--      en créer une pour n'importe quel compte.
--      Seule la partie « with check » (ce qu'on écrit) change ; ce qu'on peut
--      LIRE ou SUPPRIMER ne change pas. Aucune ligne existante n'est touchée.
-- Ce qu'il ne fait PAS : aucune autre règle changée, aucun droit (GRANT)
-- ajouté, aucune donnée touchée ; anon toujours sans aucun droit.
-- Sécurité : tout est dans UNE transaction ; garde-fou au début (les règles
-- doivent être exactement celles d'aujourd'hui, ou celles d'après ce script) ;
-- la table submissions doit être VIDE (sinon arrêt) ; 5 vérifications à la
-- fin ; si une seule échoue, rien n'est changé. Ré-exécutable sans risque.
-- Retour arrière : en bas du fichier, dans le bloc /* … */.
-- NB : après ce script, ne plus relancer 47_rls_speed.sql (son garde-fou
-- l'arrêtera de toute façon, sans rien changer).
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0. Garde-fou : les règles de sécurité de public doivent être EXACTEMENT
--    celles d'aujourd'hui (62 règles, empreinte 5647f84a7b5033a85a96a1870c7a5722)
--    ou celles d'après ce script (58 règles, empreinte 65c8a9cc3b90733a70e8768f6a232aa4).
--    Et la table submissions, si elle existe encore, doit être vide.
--    Sinon : arrêt, rien n'est changé.
-- ---------------------------------------------------------------------
do $guard$
declare v text; n bigint;
begin
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' into v;
  if v is distinct from '5647f84a7b5033a85a96a1870c7a5722' and v is distinct from '65c8a9cc3b90733a70e8768f6a232aa4' then
    raise exception 'Les regles de securite ne sont pas celles attendues (empreinte %). Rien n''est change.', v;
  end if;
  if to_regclass('public.submissions') is not null then
    execute 'select count(*) from public.submissions' into n;
    if n > 0 then
      raise exception 'La table submissions contient % ligne(s) : on ne la supprime pas. Rien n''est change.', n;
    end if;
  end if;
end $guard$;

-- ---------------------------------------------------------------------
-- 1. L'ancien système de rendu.
--    (Sans « cascade » : si quelque chose d'inattendu en dépendait encore,
--    Postgres refuserait et rien ne serait changé.)
-- ---------------------------------------------------------------------
drop table if exists public.submissions;
drop function if exists public.submissions_guard();
drop function if exists public.submit_student_answer(uuid, uuid, jsonb);

-- ---------------------------------------------------------------------
-- 2. assignment_feedback : écrire une note seulement pour un élève inscrit
--    dans la classe du devoir. La 1re partie de chaque condition est la
--    règle d'aujourd'hui, mot pour mot ; on y ajoute « et l'élève est
--    inscrit ». (Les profs d'un examen voient déjà la liste des inscrits
--    de l'examen : is_class_teacher les compte.)
-- ---------------------------------------------------------------------
alter policy "teachers manage feedback in own class" on public.assignment_feedback
  with check ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = assignment_feedback.assignment_id) AND (c.teacher_id = (select auth.uid())))))
  AND (EXISTS ( SELECT 1
   FROM (assignments a2
     JOIN roster r ON ((r.class_id = a2.class_id)))
  WHERE ((a2.id = assignment_feedback.assignment_id) AND (r.student_id = assignment_feedback.student_id)))));

alter policy "exam staff mark feedback" on public.assignment_feedback
  with check ((is_exam_staff_of_assignment(assignment_id)
  AND (EXISTS ( SELECT 1
   FROM (assignments a2
     JOIN roster r ON ((r.class_id = a2.class_id)))
  WHERE ((a2.id = assignment_feedback.assignment_id) AND (r.student_id = assignment_feedback.student_id))))));

-- ---------------------------------------------------------------------
-- 3. Vérifications. Si une seule échoue : tout est annulé.
-- ---------------------------------------------------------------------
do $check$
declare v text; n int;
begin
  -- V1 : l'ancien système a disparu ; is_assignment_teacher est toujours là.
  if to_regclass('public.submissions') is not null
     or to_regprocedure('public.submissions_guard()') is not null
     or to_regprocedure('public.submit_student_answer(uuid,uuid,jsonb)') is not null then
    raise exception 'V1 : l''ancien systeme est encore la.';
  end if;
  if to_regprocedure('public.is_assignment_teacher(uuid)') is null
     or not exists (select 1 from pg_policies where schemaname='public' and tablename='listening_plays'
                    and policyname='teachers read play counts in own classes') then
    raise exception 'V1 : is_assignment_teacher ou la regle de listening_plays a disparu.';
  end if;

  -- V2 : 58 règles sur public (62 - les 4 de submissions).
  select count(*) into n from pg_policies where schemaname = 'public';
  if n <> 58 then raise exception 'V2 : % regles au lieu de 58.', n; end if;

  -- V3 : sur assignment_feedback, ce qu'on peut LIRE ne change pas ;
  --      ce qu'on peut ÉCRIRE demande maintenant l'inscription.
  select md5(string_agg(policyname||'|'||cmd||'|'||coalesce(qual,''), E'\n' order by policyname)) into v
    from pg_policies where schemaname='public' and tablename='assignment_feedback';
  if v is distinct from '49078eef8af51a6a3d5c9e4a4a56b26a' then
    raise exception 'V3 : les conditions de lecture de assignment_feedback ont change (%).', v;
  end if;
  select count(*) into n from pg_policies where schemaname='public' and tablename='assignment_feedback'
     and policyname in ('teachers manage feedback in own class','exam staff mark feedback')
     and with_check like '%JOIN roster r ON ((r.class_id = a2.class_id))%'
     and with_check like '%(r.student_id = assignment_feedback.student_id)%';
  if n <> 2 then raise exception 'V3 : la condition d''inscription manque (% regle(s) sur 2).', n; end if;

  -- V4 : toujours la RLS partout, et toujours rien pour anon.
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception 'V4 : % table(s) sans RLS.', n; end if;
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon';
  if n <> 0 then raise exception 'V4 : anon a % droit(s) sur des tables.', n; end if;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  if n <> 0 then raise exception 'V4 : anon peut lancer % fonction(s).', n; end if;

  -- V5 : l'empreinte complète des règles est exactement celle prévue.
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' into v;
  if v is distinct from '65c8a9cc3b90733a70e8768f6a232aa4' then
    raise exception 'V5 : empreinte des regles inattendue (%).', v;
  end if;

  raise notice '48 OK : ancien systeme supprime, feedback resserre, 5 verifications passees.';
end $check$;

commit;

select '48 OK — 5 vérifications passées' as resultat;


/* =====================================================================
   RETOUR ARRIÈRE (seulement si on doit revenir exactement à avant le 48)
   Copier depuis la ligne « -- DÉBUT » jusqu'à la ligne « -- FIN » dans
   l'éditeur SQL de Supabase, puis Run. La table submissions revient VIDE
   (elle l'était), avec ses règles, son déclencheur, ses index et ses droits.
   =====================================================================
-- DÉBUT
begin;

do $guard$
declare v text;
begin
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' into v;
  if v is distinct from '65c8a9cc3b90733a70e8768f6a232aa4' then
    raise exception 'Retour arriere : la base n''est pas dans l''etat d''apres le 48 (empreinte %). Rien n''est change.', v;
  end if;
end $guard$;

-- assignment_feedback : la condition d'écriture d'avant.
alter policy "teachers manage feedback in own class" on public.assignment_feedback
  with check ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = assignment_feedback.assignment_id) AND (c.teacher_id = (select auth.uid()))))));
alter policy "exam staff mark feedback" on public.assignment_feedback
  with check (is_exam_staff_of_assignment(assignment_id));

-- La table submissions, vide, à l'identique.
create table public.submissions (
  id uuid not null default gen_random_uuid(),
  assignment_id uuid not null,
  student_id uuid not null,
  content text not null default ''::text,
  started_at timestamp with time zone,
  submitted_at timestamp with time zone,
  grade text,
  feedback text,
  graded_at timestamp with time zone,
  score_task_achievement numeric(3,1),
  score_coherence_cohesion numeric(3,1),
  score_lexical_resource numeric(3,1),
  score_grammar_accuracy numeric(3,1)
);
alter table public.submissions add constraint submissions_pkey PRIMARY KEY (id);
alter table public.submissions add constraint submissions_assignment_id_student_id_key UNIQUE (assignment_id, student_id);
alter table public.submissions add constraint submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;
alter table public.submissions add constraint submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
create index idx_submissions_student_id on public.submissions using btree (student_id);
alter table public.submissions enable row level security;
revoke all on public.submissions from public, anon, authenticated;
grant select, insert, update, delete on public.submissions to authenticated;
grant all on public.submissions to service_role;

CREATE OR REPLACE FUNCTION public.submissions_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Appel hors navigateur (tâche serveur, éditeur SQL) : on laisse faire.
  if auth.uid() is null then return new; end if;
  -- Le professeur de la classe : rien à vérifier.
  if public.is_assignment_teacher(coalesce(new.assignment_id, old.assignment_id)) then return new; end if;

  if tg_op = 'INSERT' then
    new.grade := null; new.feedback := null; new.graded_at := null;
    new.score_task_achievement := null; new.score_coherence_cohesion := null;
    new.score_lexical_resource := null; new.score_grammar_accuracy := null;
  else
    if (new.grade is distinct from old.grade and new.grade is not null)
    or (new.feedback is distinct from old.feedback and new.feedback is not null)
    or (new.graded_at is distinct from old.graded_at and new.graded_at is not null)
    or (new.score_task_achievement is distinct from old.score_task_achievement and new.score_task_achievement is not null)
    or (new.score_coherence_cohesion is distinct from old.score_coherence_cohesion and new.score_coherence_cohesion is not null)
    or (new.score_lexical_resource  is distinct from old.score_lexical_resource  and new.score_lexical_resource  is not null)
    or (new.score_grammar_accuracy  is distinct from old.score_grammar_accuracy  and new.score_grammar_accuracy  is not null)
    then
      raise exception 'Only the teacher can set a mark';
    end if;
  end if;
  return new;
end $function$;

revoke all on function public.submissions_guard() from public, anon;
grant execute on function public.submissions_guard() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_student_answer(p_assignment_id uuid, p_question_id uuid, p_response jsonb)
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
  v_grade      record;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select class_id, time_limit_minutes into v_class_id, v_limit
  from public.assignments where id = p_assignment_id;
  if v_class_id is null then
    raise exception 'Assignment not found';
  end if;

  if not exists (select 1 from public.roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  if not exists (
    select 1
    from public.assignment_questions aq
    join public.exam_sections s on s.id = aq.section_id
    where aq.question_id = p_question_id and s.assignment_id = p_assignment_id
  ) then
    raise exception 'Question not in this assignment';
  end if;

  select started_at, submitted_at into v_started, v_submitted
  from public.exam_attempts
  where assignment_id = p_assignment_id and student_id = v_student_id;

  if v_submitted is not null then
    raise exception 'Already submitted';
  end if;

  -- An answer already given can never be changed.
  if exists (select 1 from public.student_answers where student_id = v_student_id and question_id = p_question_id) then
    raise exception 'Already answered';
  end if;

  -- Submissions made with the old one-by-one method finish within
  -- seconds: anything added long after the first answer is refused.
  if exists (
    select 1 from public.student_answers
    where assignment_id = p_assignment_id and student_id = v_student_id
      and answered_at < now() - interval '2 minutes'
  ) then
    raise exception 'Already submitted';
  end if;

  if v_limit is not null then
    if v_started is null then
      raise exception 'Exam not started';
    end if;
    if now() > v_started + make_interval(mins => v_limit + 5) then
      raise exception 'Time is over';
    end if;
  end if;

  select * into v_grade from public.grade_student_answer(p_question_id, p_response);

  insert into public.student_answers (assignment_id, student_id, question_id, response, is_correct, points_earned)
  values (p_assignment_id, v_student_id, p_question_id, p_response, v_grade.is_correct, v_grade.points_earned);

  return jsonb_build_object('is_correct', v_grade.is_correct, 'points_earned', v_grade.points_earned, 'points_possible', v_grade.points_possible);
end;
$function$;

revoke all on function public.submit_student_answer(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_student_answer(uuid, uuid, jsonb) to service_role;

create trigger trg_submissions_guard before insert or update on public.submissions
  for each row execute function public.submissions_guard();

create policy "students can submit own work" on public.submissions
  as permissive for insert to public
  with check (((select auth.uid()) = student_id));
create policy "students can update own submission" on public.submissions
  as permissive for update to public
  using (((select auth.uid()) = student_id));
create policy "submissions readable by owner or teacher" on public.submissions
  as permissive for select to public
  using (((student_id = (select auth.uid())) OR is_assignment_teacher(assignment_id)));
create policy "teachers can grade submissions in own class" on public.submissions
  as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN classes c ON ((c.id = a.class_id)))
  WHERE ((a.id = submissions.assignment_id) AND (c.teacher_id = (select auth.uid()))))));

do $check$
declare v text;
begin
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' into v;
  if v is distinct from '5647f84a7b5033a85a96a1870c7a5722' then
    raise exception 'Retour arriere : empreinte inattendue (%). Rien n''est change.', v;
  end if;
end $check$;

commit;
select 'Retour arrière du 48 : OK' as resultat;
-- FIN
*/
