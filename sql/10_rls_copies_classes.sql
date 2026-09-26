-- =====================================================================
--  AIU Assignment Hub — étape 2 des failles de sécurité
--
--  Ferme F3  (les copies et les notes de tous les étudiants étaient
--             lisibles par n'importe quel compte),
--        F4  (le code d'une classe était visible de tous, et on
--             pouvait s'inscrire à n'importe quelle classe sans lui),
--        F12 (aucune règle UPDATE sur assignments : modifier un devoir
--             Speaking ou Writing ne faisait rien, en silence),
--        F16 (un étudiant pouvait se déclarer professeur),
--        F17 (un étudiant pouvait se mettre une note),
--        F9  (tout le monde voyait qui était dans quelle classe),
--        F13 (aucune règle DELETE sur roster : « retirer l'étudiant »
--             et « quitter la classe » ne faisaient rien, en silence).
--
--  Ce script est RELANÇABLE et ne supprime aucune donnée.
--  À coller dans Supabase → SQL Editor → Run.
--  ATTENTION : le fichier JoinClass.jsx doit être en ligne AVANT.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Fonctions d'aide (même principe qu'à l'étape 1 : elles ne
--    répondent qu'au sujet de la personne connectée).
-- ---------------------------------------------------------------------

create or replace function public.is_class_teacher(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes c where c.id = p_class_id and c.teacher_id = auth.uid());
$$;

create or replace function public.is_assignment_teacher(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from assignments a join classes c on c.id = a.class_id
                 where a.id = p_assignment_id and c.teacher_id = auth.uid());
$$;

create or replace function public.is_enrolled(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from roster r where r.class_id = p_class_id and r.student_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 2. F4 — rejoindre une classe.
--
--    Avant : le navigateur cherchait la classe par son code, puis
--    insérait la ligne lui-même. Comme la liste des classes était
--    ouverte, le code ne servait à rien : on pouvait s'inscrire
--    directement par l'API. Désormais la liste est privée et cette
--    fonction est la SEULE porte d'entrée : elle vérifie le code et
--    inscrit dans le même geste, côté serveur.
--    La relancer deux fois est sans effet (on conflict do nothing).
-- ---------------------------------------------------------------------

create or replace function public.join_class(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_code is null or length(trim(p_code)) < 3 or length(trim(p_code)) > 12 then
    raise exception 'Invalid code';
  end if;
  select id, name into v_id, v_name from classes where upper(code) = upper(trim(p_code));
  if v_id is null then raise exception 'No class found with that code'; end if;
  insert into roster(class_id, student_id) values (v_id, auth.uid()) on conflict do nothing;
  return jsonb_build_object('class_id', v_id, 'name', v_name);
end $$;

-- ---------------------------------------------------------------------
-- 3. F17 — seul le professeur peut poser une note.
--
--    La règle d'écriture de l'étudiant ne vérifiait que « c'est bien ma
--    ligne » : il pouvait donc écrire lui-même grade, feedback et les
--    quatre sous-notes du Writing. Une règle RLS ne sait pas protéger
--    une colonne ; ce déclencheur le fait.
--
--    Il laisse passer la remise d'une copie qui remet ces champs à
--    vide (c'est ce que fait le site quand on rend à nouveau) et ne
--    gêne jamais le professeur.
-- ---------------------------------------------------------------------

create or replace function public.submissions_guard() returns trigger
language plpgsql security definer set search_path = public as $$
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
end $$;

drop trigger if exists trg_submissions_guard on public.submissions;
create trigger trg_submissions_guard
  before insert or update on public.submissions
  for each row execute function public.submissions_guard();

-- ---------------------------------------------------------------------
-- 4. F3 — une copie n'est lisible que par son auteur et par le
--    professeur de la classe.
-- ---------------------------------------------------------------------

drop policy if exists "submissions viewable by authenticated"    on public.submissions;
drop policy if exists "submissions readable by owner or teacher" on public.submissions;
create policy "submissions readable by owner or teacher"
  on public.submissions for select
  using (student_id = auth.uid() or public.is_assignment_teacher(assignment_id));

-- ---------------------------------------------------------------------
-- 5. F4 (suite) et F9 — classes et liste des inscrits.
-- ---------------------------------------------------------------------

drop policy if exists "classes viewable by authenticated"   on public.classes;
drop policy if exists "classes readable by owner or member" on public.classes;
create policy "classes readable by owner or member"
  on public.classes for select
  using (teacher_id = auth.uid() or public.is_enrolled(id));

-- L'inscription directe disparaît : elle passe par join_class().
drop policy if exists "students can join classes" on public.roster;

drop policy if exists "roster viewable by authenticated"     on public.roster;
drop policy if exists "roster readable by owner or teacher"  on public.roster;
create policy "roster readable by owner or teacher"
  on public.roster for select
  using (student_id = auth.uid() or public.is_class_teacher(class_id));

-- F13 : « retirer l'étudiant » (professeur) et « quitter la classe »
-- (étudiant) ne faisaient rien faute de règle. Les voilà.
drop policy if exists "student leaves or teacher removes" on public.roster;
create policy "student leaves or teacher removes"
  on public.roster for delete
  using (student_id = auth.uid() or public.is_class_teacher(class_id));

-- ---------------------------------------------------------------------
-- 6. F12 — le professeur peut modifier ses propres devoirs.
--    Sans cette règle, TeacherSpeakingBuilder et TeacherWritingBuilder
--    « enregistraient » sans que rien ne change dans la base.
-- ---------------------------------------------------------------------

drop policy if exists "teacher updates own assignments" on public.assignments;
create policy "teacher updates own assignments"
  on public.assignments for update
  using      (public.is_class_teacher(class_id))
  with check (public.is_class_teacher(class_id));

-- ---------------------------------------------------------------------
-- 7. F16 — personne ne peut changer son propre rôle.
--
--    La règle disait « tu peux modifier ta ligne » sans préciser quelles
--    colonnes : un étudiant pouvait donc se déclarer professeur. On
--    retire le droit d'écriture sur la table et on ne rend que le nom,
--    seul champ que le site modifie (Profile.jsx).
-- ---------------------------------------------------------------------

revoke update on public.profiles from authenticated, anon;
grant  update (name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 8. Droits sur les nouvelles fonctions.
-- ---------------------------------------------------------------------

revoke all on function public.is_class_teacher(uuid)      from public, anon;
revoke all on function public.is_assignment_teacher(uuid) from public, anon;
revoke all on function public.is_enrolled(uuid)           from public, anon;
revoke all on function public.join_class(text)            from public, anon;
grant execute on function public.is_class_teacher(uuid)      to authenticated;
grant execute on function public.is_assignment_teacher(uuid) to authenticated;
grant execute on function public.is_enrolled(uuid)           to authenticated;
grant execute on function public.join_class(text)            to authenticated;

commit;

-- =====================================================================
--  VÉRIFICATIONS — à lire après l'exécution
-- =====================================================================

-- V1. Les règles trop larges ont disparu, les nouvelles sont là.
select tablename, cmd, policyname
from pg_policies
where schemaname = 'public' and tablename in ('submissions','classes','roster','assignments')
order by tablename, cmd, policyname;
-- Attendu : plus aucune ligne « … viewable by authenticated » ;
--           « teacher updates own assignments » sur assignments ;
--           SELECT + DELETE sur roster, et PLUS d'INSERT.

-- V2. Le déclencheur des notes est posé.
select tgname, tgenabled from pg_trigger
where tgrelid = 'public.submissions'::regclass and not tgisinternal;
-- Attendu : trg_submissions_guard, tgenabled = O.

-- V3. Sur profiles, seul le nom est modifiable.
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema='public' and table_name='profiles' and grantee='authenticated' and privilege_type='UPDATE'
order by column_name;
-- Attendu : une seule ligne, colonne « name ».

-- V4. Le test qui compte. Un vrai compte, ni propriétaire ni inscrit,
--     essaie tout. (Transaction annulée : ne modifie rien.)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select 'un exterieur voit :' as test,
       (select count(*) from submissions) as copies,
       (select count(*) from classes)     as classes,
       (select count(*) from roster)      as inscrits;
rollback;
-- Attendu : que des zéros.
