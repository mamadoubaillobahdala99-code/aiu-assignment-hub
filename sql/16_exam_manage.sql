-- =====================================================================
--  AIU Assignment Hub — gerer un examen
--
--  CE QUE CE FICHIER AJOUTE
--  1. Le prof INVITE voit enfin les copies. La fenetre d'invitation lui
--     promet qu'il peut "surveiller l'examen, autoriser une reprise et
--     corriger les copies" — mais la base ne lui montrait rien : zero
--     reponse, zero copie rendue. Verifie et reproduit avant d'ecrire
--     ce fichier. Les regles de lecture avaient ete ecrites pour les
--     classes ("le prof voit les questions QU'IL a creees", "les copies
--     DE SES classes") ; dans un examen, l'invite n'a rien cree et ne
--     possede rien.
--  2. Dupliquer un examen entier : meme epreuves, nouveau code, sans
--     les candidats ni les copies. Pour refaire le meme examen avec une
--     autre classe.
--  3. Supprimer un examen, avec ses epreuves, pour nettoyer l'ecran.
--  4. Renommer un examen.
--  5. UN GARDE-FOU : tant qu'un examen tourne, on ne peut plus detruire
--     le contenu de ses epreuves. Modifier une epreuve efface les
--     reponses deja rendues — en classe c'est acceptable, en plein
--     examen ce serait une catastrophe.
--  6. Dans un examen, c'est l'examen qui publie les notes, pas
--     l'epreuve (point 7 plus bas).
--  7. RENDRE UN WRITING DEBLOQUE ENFIN LA SUITE (point 8 plus bas) —
--     le bug le plus grave trouve aujourd'hui.
--  8. Une epreuve de Speaking ne bloque plus ce qui la suit (point 9).
--
--  CE FICHIER MODIFIE AUSSI TROIS CHOSES DEJA ENREGISTREES.
--  Il ne supprime rien, mais il corrige :
--    - les epreuves d'examen dont la case "montrer la note tout de
--      suite" etait cochee : elle repasse a non, jusqu'a la publication ;
--    - les Writing deja rendus : leur rendu est inscrit dans le registre
--      des copies, sinon les examens en cours resteraient bloques.
--  Aucune reponse, aucune note, aucune copie n'est touchee.
--
--  COMMENT L'ELARGISSEMENT DU POINT 1 EST FAIT
--  On ne TOUCHE PAS aux regles existantes. On en AJOUTE de nouvelles, a
--  cote, qui n'accordent que ceci : "je suis prof invite sur la session
--  d'examen a laquelle appartient cette epreuve". Une regle ajoutee ne
--  peut qu'ouvrir, jamais casser ce qui marchait. Et la portee est
--  exactement celle de la promesse : rien en dehors des examens, et
--  seulement les sessions ou le proprietaire a invite ce prof.
--
--  RELANCABLE. Ne supprime aucune donnee.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Deux questions que les nouvelles regles poseront
-- ---------------------------------------------------------------------

-- Suis-je prof d'une session d'examen a laquelle appartient cette epreuve ?
create or replace function public.is_exam_staff_of_assignment(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from exam_session_items i
    join exam_session_staff s on s.session_id = i.session_id
    where i.assignment_id = p_assignment_id
      and s.teacher_id = auth.uid()
  );
$$;

-- Meme question, mais posee a partir d'une question d'examen.
create or replace function public.is_exam_staff_of_question(p_question_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from assignment_questions aq
    join exam_sections es        on es.id = aq.section_id
    join exam_session_items i    on i.assignment_id = es.assignment_id
    join exam_session_staff s    on s.session_id = i.session_id
    where aq.question_id = p_question_id
      and s.teacher_id = auth.uid()
  );
$$;

revoke all on function public.is_exam_staff_of_assignment(uuid) from public, anon;
revoke all on function public.is_exam_staff_of_question(uuid)   from public, anon;
grant execute on function public.is_exam_staff_of_assignment(uuid) to authenticated;
grant execute on function public.is_exam_staff_of_question(uuid)   to authenticated;

create index if not exists idx_exam_staff_session on public.exam_session_staff(session_id, teacher_id);

-- ---------------------------------------------------------------------
-- 2. Ce que le prof invite peut voir et faire
--
--    LECTURE seulement pour les copies, les reponses et le corrige.
--    ECRITURE seulement la ou il doit corriger : la note et le
--    commentaire. Il ne peut pas modifier le corrige de l'examen.
-- ---------------------------------------------------------------------

drop policy if exists "exam staff read answers" on public.student_answers;
create policy "exam staff read answers"
  on public.student_answers for select
  using (public.is_exam_staff_of_question(question_id));

drop policy if exists "exam staff read attempts" on public.exam_attempts;
create policy "exam staff read attempts"
  on public.exam_attempts for select
  using (public.is_exam_staff_of_assignment(assignment_id));

drop policy if exists "exam staff read writing" on public.writing_responses;
create policy "exam staff read writing"
  on public.writing_responses for select
  using (public.is_exam_staff_of_assignment(assignment_id));

drop policy if exists "exam staff read answer keys" on public.question_answer_key;
create policy "exam staff read answer keys"
  on public.question_answer_key for select
  using (public.is_exam_staff_of_question(question_id));

drop policy if exists "exam staff read speaking views" on public.speaking_views;
create policy "exam staff read speaking views"
  on public.speaking_views for select
  using (public.is_exam_staff_of_assignment(assignment_id));

-- Corriger : la note et le commentaire.
drop policy if exists "exam staff mark feedback" on public.assignment_feedback;
create policy "exam staff mark feedback"
  on public.assignment_feedback for all
  using (public.is_exam_staff_of_assignment(assignment_id))
  with check (public.is_exam_staff_of_assignment(assignment_id));

drop policy if exists "exam staff mark writing" on public.writing_grades;
create policy "exam staff mark writing"
  on public.writing_grades for all
  using (public.is_exam_staff_of_assignment(assignment_id))
  with check (public.is_exam_staff_of_assignment(assignment_id));

-- ---------------------------------------------------------------------
-- 3. Renommer
--    Le contenant prive porte le meme nom que la session ; il suit.
-- ---------------------------------------------------------------------

create or replace function public.rename_exam_session(p_session_id uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text; v_class uuid;
begin
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;
  v_name := left(trim(coalesce(p_name, '')), 120);
  if length(v_name) = 0 then raise exception 'A name is required'; end if;

  update exam_sessions set name = v_name where id = p_session_id
  returning container_class_id into v_class;
  update classes set name = v_name where id = v_class;

  return jsonb_build_object('name', v_name);
end $$;

-- ---------------------------------------------------------------------
-- 4. Dupliquer un examen entier
--
--    Ce qui est copie : les reglages (mode strict, depart du Listening),
--    les epreuves dans le meme ordre, leurs parties, leurs groupes,
--    leurs questions et leur corrige, et l'equipe de profs.
--    Ce qui n'est PAS copie : le creneau horaire (il appartient a un
--    jour precis), les candidats, les copies, les notes, les resultats.
--    La copie naît fermee : personne ne peut la rejoindre tant que le
--    prof n'a pas clique sur Ouvrir.
--
--    Tout se fait en UN SEUL bloc : si quoi que ce soit echoue, rien
--    n'est cree. Pas de demi-examen.
-- ---------------------------------------------------------------------

create or replace function public.duplicate_exam_session(p_session_id uuid, p_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_src     record;
  v_code    text;
  v_try     integer := 0;
  v_class   uuid;
  v_session uuid;
  v_name    text;
  v_item    record;
  v_sec     record;
  v_grp     record;
  v_link    record;
  v_new_a   uuid;
  v_new_s   uuid;
  v_new_g   uuid;
  v_new_q   uuid;
  v_papers  integer := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_src from exam_sessions where id = p_session_id;
  if not found then raise exception 'Exam not found'; end if;
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;

  v_name := left(trim(coalesce(nullif(trim(p_name), ''), v_src.name || ' (copy)')), 120);

  loop
    v_try := v_try + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from classes where upper(code) = v_code)
          and not exists (select 1 from exam_sessions where upper(code) = v_code);
    if v_try > 20 then raise exception 'Could not allocate a code'; end if;
  end loop;

  insert into classes (name, teacher_id, code, kind)
  values (v_name, auth.uid(), 'EX-' || v_code, 'exam')
  returning id into v_class;

  insert into exam_sessions (name, code, container_class_id, created_by, strict_mode, listening_start)
  values (v_name, v_code, v_class, auth.uid(), v_src.strict_mode, v_src.listening_start)
  returning id into v_session;

  -- Celui qui duplique devient proprietaire ; l'equipe le suit.
  insert into exam_session_staff (session_id, teacher_id, role)
  values (v_session, auth.uid(), 'owner')
  on conflict do nothing;
  insert into exam_session_staff (session_id, teacher_id, role)
  select v_session, s.teacher_id, 'co'
  from exam_session_staff s
  where s.session_id = p_session_id and s.teacher_id <> auth.uid()
  on conflict do nothing;

  for v_item in
    select i.order_index as pos, a.*
    from exam_session_items i
    join assignments a on a.id = i.assignment_id
    where i.session_id = p_session_id
    order by i.order_index
  loop
    insert into assignments (
      class_id, title, type, description, due_date, due_time, time_limit_minutes,
      target_word_count, image_url, reading_question_count, reading_questions_text,
      allow_audio_pause, auto_release_score, show_answer_review, reading_test_type,
      listening_audio_url, listening_exam_mode, listening_check_minutes)
    values (
      v_class, v_item.title, v_item.type, v_item.description, v_item.due_date, v_item.due_time,
      v_item.time_limit_minutes, v_item.target_word_count, v_item.image_url,
      v_item.reading_question_count, v_item.reading_questions_text, v_item.allow_audio_pause,
      v_item.auto_release_score, v_item.show_answer_review, v_item.reading_test_type,
      v_item.listening_audio_url, v_item.listening_exam_mode, v_item.listening_check_minutes)
    returning id into v_new_a;

    insert into exam_session_items (session_id, assignment_id, order_index)
    values (v_session, v_new_a, v_item.pos);
    v_papers := v_papers + 1;

    for v_sec in select * from exam_sections where assignment_id = v_item.id order by order_index loop
      insert into exam_sections (
        assignment_id, title, order_index, passage_text, instruction, passage_title,
        audio_url, max_plays, image_url, task_number, speaking_part, documents)
      values (
        v_new_a, v_sec.title, v_sec.order_index, v_sec.passage_text, v_sec.instruction,
        v_sec.passage_title, v_sec.audio_url, v_sec.max_plays, v_sec.image_url,
        v_sec.task_number, v_sec.speaking_part, v_sec.documents)
      returning id into v_new_s;

      for v_grp in select * from question_groups where section_id = v_sec.id order by order_index loop
        insert into question_groups (section_id, instruction, passage_text, order_index, image_url)
        values (v_new_s, v_grp.instruction, v_grp.passage_text, v_grp.order_index, v_grp.image_url)
        returning id into v_new_g;

        for v_link in
          select aq.order_index as pos, q.*
          from assignment_questions aq
          join questions q on q.id = aq.question_id
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

      -- Filet : une question rattachee a la partie sans groupe. Il n'y en
      -- a aucune aujourd'hui, mais rien ne doit disparaitre en silence.
      for v_link in
        select aq.order_index as pos, q.*
        from assignment_questions aq
        join questions q on q.id = aq.question_id
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
  end loop;

  return jsonb_build_object('session_id', v_session, 'code', v_code, 'name', v_name, 'papers', v_papers);
end $$;

-- ---------------------------------------------------------------------
-- 5. Supprimer un examen
--
--    Seul le createur. Jamais pendant que l'examen tourne.
--    Les questions ne disparaissent pas en cascade (elles vivent leur
--    propre vie) : on les supprime nous-memes, et UNIQUEMENT celles que
--    plus aucune autre epreuve n'utilise — une question partagee avec
--    un devoir de classe n'est jamais touchee.
-- ---------------------------------------------------------------------

create or replace function public.delete_exam_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_src record; v_qids uuid[]; v_removed integer := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_src from exam_sessions where id = p_session_id;
  if not found then raise exception 'Exam not found'; end if;
  if v_src.created_by <> auth.uid() then raise exception 'Only the creator can delete this exam'; end if;
  if v_src.opened_at is not null and v_src.closed_at is null then
    raise exception 'This exam is running — close it first';
  end if;

  select coalesce(array_agg(distinct aq.question_id), '{}')
    into v_qids
  from assignment_questions aq
  join exam_sections es on es.id = aq.section_id
  join assignments a    on a.id = es.assignment_id
  where a.class_id = v_src.container_class_id;

  delete from exam_sessions where id = p_session_id;      -- items + staff en cascade
  delete from classes       where id = v_src.container_class_id;  -- epreuves, parties, groupes, liens, copies

  if array_length(v_qids, 1) > 0 then
    delete from questions q
     where q.id = any(v_qids)
       and not exists (select 1 from assignment_questions aq where aq.question_id = q.id);
    get diagnostics v_removed = row_count;
  end if;

  return jsonb_build_object('deleted', true, 'questions_removed', v_removed);
end $$;

revoke all on function public.rename_exam_session(uuid, text)    from public, anon;
revoke all on function public.duplicate_exam_session(uuid, text) from public, anon;
revoke all on function public.delete_exam_session(uuid)          from public, anon;
grant execute on function public.rename_exam_session(uuid, text)    to authenticated;
grant execute on function public.duplicate_exam_session(uuid, text) to authenticated;
grant execute on function public.delete_exam_session(uuid)          to authenticated;

-- ---------------------------------------------------------------------
-- 6. LE GARDE-FOU
--
--    Modifier une epreuve, cote application, commence par effacer ses
--    questions et ses parties pour les reecrire. En classe, l'ecran
--    previent et c'est accepte. En plein examen, ce serait la salle
--    entiere perdue.
--
--    Tant qu'un examen est ouvert (lance et pas encore ferme), plus
--    rien de son contenu ne peut etre detruit. L'ecran cache deja les
--    boutons ; ceci est la barriere qui, elle, ne peut pas etre
--    contournee. Les classes ordinaires ne sont pas concernees.
-- ---------------------------------------------------------------------

create or replace function public.exam_live_content_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_live boolean;
begin
  if tg_table_name = 'questions' then
    select exists (
      select 1
      from assignment_questions aq
      join exam_sections es     on es.id = aq.section_id
      join exam_session_items i on i.assignment_id = es.assignment_id
      join exam_sessions e      on e.id = i.session_id
      where aq.question_id = old.id
        and e.opened_at is not null and e.closed_at is null
    ) into v_live;
  else
    select exists (
      select 1
      from exam_session_items i
      join exam_sessions e on e.id = i.session_id
      where i.assignment_id = old.assignment_id
        and e.opened_at is not null and e.closed_at is null
    ) into v_live;
  end if;

  if v_live then
    raise exception 'This exam is running — close it before changing its papers';
  end if;
  return old;
end $$;

drop trigger if exists guard_live_exam_questions on public.questions;
create trigger guard_live_exam_questions
  before delete on public.questions
  for each row execute function public.exam_live_content_guard();

drop trigger if exists guard_live_exam_sections on public.exam_sections;
create trigger guard_live_exam_sections
  before delete on public.exam_sections
  for each row execute function public.exam_live_content_guard();

-- ---------------------------------------------------------------------
-- 7. DANS UN EXAMEN, C'EST L'EXAMEN QUI PUBLIE — PAS L'EPREUVE
--
--    Trouve en verifiant le point 1 : l'etudiant voyait sa note notee
--    DES QU'IL RENDAIT, examen encore ouvert, rien de publie. La cause :
--    la case "montrer le score automatiquement" est cochee par defaut
--    dans les constructeurs, et elle vaut aussi pour les epreuves
--    d'examen. Resultat : le bouton "Publier les resultats" ne servait
--    a rien, et un candidat apprenait sa note du Listening pendant
--    qu'il composait le Reading.
--
--    La regle : dans un contenant d'examen, auto_release_score ne peut
--    etre vrai QUE si les resultats de la session sont publies. La
--    valeur est corrigee en silence plutot que refusee — la case du
--    constructeur n'a simplement pas de sens dans un examen, c'est
--    l'examen qui decide.  Les classes ordinaires ne sont pas touchees.
-- ---------------------------------------------------------------------

create or replace function public.exam_paper_release_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_is_exam boolean; v_released boolean;
begin
  if new.auto_release_score is not true then
    return new;
  end if;

  select (c.kind = 'exam') into v_is_exam from classes c where c.id = new.class_id;
  if not coalesce(v_is_exam, false) then
    return new;
  end if;

  select exists (
    select 1
    from exam_sessions e
    where e.container_class_id = new.class_id
      and e.results_released_at is not null
  ) into v_released;

  if not v_released then
    new.auto_release_score := false;
  end if;
  return new;
end $$;

drop trigger if exists guard_exam_paper_release on public.assignments;
create trigger guard_exam_paper_release
  before insert or update on public.assignments
  for each row execute function public.exam_paper_release_guard();

-- Les epreuves d'examen deja construites avec la case cochee sont
-- remises d'aplomb. Aucune donnee n'est supprimee : on ne fait que
-- rendre la publication a l'examen, qui la donnera au bon moment.
update public.assignments a
   set auto_release_score = false
  from public.classes c
 where c.id = a.class_id
   and c.kind = 'exam'
   and a.auto_release_score
   and not exists (select 1 from public.exam_sessions e
                   where e.container_class_id = a.class_id
                     and e.results_released_at is not null);

-- ---------------------------------------------------------------------
-- 8. RENDRE UN WRITING DEBLOQUE ENFIN L'EPREUVE SUIVANTE
--
--    Reproduit sur la vraie base : un examen "1) Writing  2) Reading".
--    Le candidat rend son Writing — writing_responses est bien marquee
--    rendue — mais submit_writing ne touchait PAS exam_attempts. Or
--    c'est exam_attempts que le verrou interroge pour savoir si
--    l'epreuve precedente est rendue.
--    Resultat : le Reading ne se deverrouillait JAMAIS. L'examen restait
--    bloque pour toujours, et l'ecran affichait le Writing comme non
--    rendu alors qu'il l'etait.
--
--    La reparation : exam_attempts devient le registre unique du
--    "cette copie est rendue", quel que soit le type d'epreuve.
--    submit_writing y marque le rendu, comme submit_student_answers.
--    Et il recoit les memes verrous de fin d'examen, sinon tout ce
--    qu'on vient de fermer resterait ouvert par la porte du Writing.
-- ---------------------------------------------------------------------

create or replace function public.submit_writing(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_student_id uuid := auth.uid();
  v_class_id   uuid;
  v_type       text;
  v_exam       record;
  v_had_copy   boolean;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select class_id, type into v_class_id, v_type from assignments where id = p_assignment_id;
  if v_class_id is null or v_type <> 'Writing' then
    raise exception 'Not a Writing assignment';
  end if;

  if not exists (select 1 from roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  -- Les memes verrous que pour les reponses : apres publication, plus
  -- rien ; apres fermeture, seulement une copie deja commencee.
  select true into v_had_copy from exam_attempts
   where assignment_id = p_assignment_id and student_id = v_student_id;
  v_had_copy := coalesce(v_had_copy, false);

  select e.closed_at, e.results_released_at into v_exam
  from exam_session_items i
  join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;

  if found then
    if v_exam.results_released_at is not null then
      raise exception 'This exam is over';
    end if;
    if v_exam.closed_at is not null and not v_had_copy then
      raise exception 'This exam is closed';
    end if;
    -- Une copie rendue est ramassee : on ne la rend pas deux fois.
    -- (Le texte etait deja gele — save_writing_draft refuse d'ecrire
    -- apres le rendu — mais la fonction repondait quand meme "rendu".
    -- Dans une classe ordinaire, on ne change rien : le double envoi y
    -- reste sans effet et sans erreur, comme avant.)
    if exists (select 1 from exam_attempts a
               where a.assignment_id = p_assignment_id
                 and a.student_id = v_student_id
                 and a.submitted_at is not null) then
      raise exception 'Already submitted';
    end if;
  end if;

  -- A task the student never typed in still gets an (empty) row, so the
  -- teacher sees it as submitted-but-blank rather than missing.
  insert into writing_responses (assignment_id, section_id, student_id)
  select p_assignment_id, s.id, v_student_id
  from exam_sections s
  where s.assignment_id = p_assignment_id and s.task_number is not null
  on conflict (section_id, student_id) do nothing;

  update writing_responses
     set submitted_at = now()
   where assignment_id = p_assignment_id
     and student_id = v_student_id
     and submitted_at is null;

  -- NOUVEAU : le registre unique du rendu.
  insert into exam_attempts (assignment_id, student_id, started_at)
  values (p_assignment_id, v_student_id, now())
  on conflict (assignment_id, student_id) do nothing;

  update exam_attempts
     set submitted_at = coalesce(submitted_at, now())
   where assignment_id = p_assignment_id and student_id = v_student_id;

  return jsonb_build_object('submitted', true);
end $function$;

revoke all on function public.submit_writing(uuid) from public, anon;
grant execute on function public.submit_writing(uuid) to authenticated;

-- Rattrapage : les Writing deja rendus avant cette reparation n'avaient
-- pas de marque dans exam_attempts. On la pose, a l'heure du rendu reel,
-- pour que les examens en cours ne restent pas bloques.
insert into public.exam_attempts (assignment_id, student_id, started_at, submitted_at)
select w.assignment_id, w.student_id, min(w.submitted_at), min(w.submitted_at)
from public.writing_responses w
where w.submitted_at is not null
group by w.assignment_id, w.student_id
on conflict (assignment_id, student_id) do nothing;

update public.exam_attempts a
   set submitted_at = w.rendu
  from (select assignment_id, student_id, min(submitted_at) as rendu
        from public.writing_responses where submitted_at is not null
        group by assignment_id, student_id) w
 where a.assignment_id = w.assignment_id
   and a.student_id = w.student_id
   and a.submitted_at is null;

-- ---------------------------------------------------------------------
-- 9. UNE EPREUVE DE SPEAKING NE BLOQUE PLUS CE QUI LA SUIT
--
--    Le Speaking structure se consulte : sujets et cue cards, rien a
--    rendre. Il n'a donc jamais de copie rendue. Place au milieu d'un
--    examen, il bloquait tout ce qui venait apres, exactement comme le
--    Writing — sauf que lui ne pourra JAMAIS etre rendu.
--    Une epreuve de Speaking ne compte donc plus comme un obstacle.
--    Elle reste soumise a son propre tour pour etre lue.
-- ---------------------------------------------------------------------

create or replace function public.exam_item_startable(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from exam_session_items i
    join exam_sessions e on e.id = i.session_id
    join roster r on r.class_id = e.container_class_id and r.student_id = auth.uid()
    where i.assignment_id = p_assignment_id
      and e.results_released_at is null
      and public.exam_is_open(e.id)
      and not exists (
        select 1 from exam_session_items prev
        join assignments pa on pa.id = prev.assignment_id
        where prev.session_id = i.session_id
          and prev.order_index < i.order_index
          and pa.type <> 'Speaking'
          and not exists (select 1 from exam_attempts a
                          where a.assignment_id = prev.assignment_id
                            and a.student_id = auth.uid()
                            and a.submitted_at is not null)
      )
      and not exists (select 1 from exam_attempts a
                      where a.assignment_id = i.assignment_id
                        and a.student_id = auth.uid()
                        and a.submitted_at is not null)
  );
$$;

create or replace function public.exam_item_readable(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from exam_session_items i
    join exam_sessions e on e.id = i.session_id
    join roster r on r.class_id = e.container_class_id and r.student_id = auth.uid()
    where i.assignment_id = p_assignment_id
      and (
        e.results_released_at is not null
        or (
          public.exam_is_open(e.id)
          and not exists (
            select 1 from exam_session_items prev
            join assignments pa on pa.id = prev.assignment_id
            where prev.session_id = i.session_id
              and prev.order_index < i.order_index
              and pa.type <> 'Speaking'
              and not exists (select 1 from exam_attempts a
                              where a.assignment_id = prev.assignment_id
                                and a.student_id = auth.uid()
                                and a.submitted_at is not null)
          )
          and not exists (select 1 from exam_attempts a
                          where a.assignment_id = i.assignment_id
                            and a.student_id = auth.uid()
                            and a.submitted_at is not null)
        )
      )
  );
$$;

revoke all on function public.exam_item_startable(uuid) from public, anon;
revoke all on function public.exam_item_readable(uuid)  from public, anon;
grant execute on function public.exam_item_startable(uuid) to authenticated;
grant execute on function public.exam_item_readable(uuid)  to authenticated;

commit;

-- =====================================================================
--  VERIFICATIONS  (a lire, rien a faire)
-- =====================================================================

-- V1. Les nouvelles regles sont posees A COTE des anciennes, qui sont
--     toutes encore la, intactes.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('student_answers','exam_attempts','writing_responses',
                    'question_answer_key','speaking_views','assignment_feedback','writing_grades')
order by tablename, policyname;

-- V2. Les cinq fonctions et les deux garde-fous existent.
select p.proname as fonction,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon', p.oid, 'execute')          as anon
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_exam_staff_of_assignment','is_exam_staff_of_question',
                    'rename_exam_session','duplicate_exam_session','delete_exam_session')
order by p.proname;

select tgname as garde_fou, c.relname as sur_la_table
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where tgname in ('guard_live_exam_questions','guard_live_exam_sections','guard_exam_paper_release');

-- V2b. Plus aucune epreuve d'examen ne publie sa note toute seule
--      avant que la session ne publie les siennes.
select count(*) as epreuves_qui_publieraient_trop_tot
from public.assignments a
join public.classes c on c.id = a.class_id
where c.kind = 'exam' and a.auto_release_score
  and not exists (select 1 from public.exam_sessions e
                  where e.container_class_id = a.class_id and e.results_released_at is not null);

-- V3. La portee de l'elargissement : il ne concerne QUE des epreuves
--     d'examen. Zero devoir de classe n'y entre.
select count(*) as epreuves_d_examen_concernees
from public.assignments a
where exists (select 1 from public.exam_session_items i where i.assignment_id = a.id);

select count(*) as devoirs_de_classe_concernes
from public.assignments a
join public.classes c on c.id = a.class_id
where c.kind = 'class'
  and exists (select 1 from public.exam_session_items i where i.assignment_id = a.id);

-- V4. Plus aucun Writing rendu sans sa marque dans le registre des
--     copies : c'est ce qui bloquait l'epreuve suivante.
select count(*) as writings_rendus_sans_marque
from (select assignment_id, student_id from public.writing_responses
      where submitted_at is not null group by assignment_id, student_id) w
where not exists (
  select 1 from public.exam_attempts a
  where a.assignment_id = w.assignment_id and a.student_id = w.student_id
    and a.submitted_at is not null);

-- V5. Les deux verrous connaissent maintenant le Speaking.
select p.proname as fonction,
       case when pg_get_functiondef(p.oid) like '%Speaking%'
            then 'OK — le Speaking ne bloque plus'
            else 'PROBLEME — la condition manque' end as verification_5
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('exam_item_startable','exam_item_readable')
order by p.proname;

-- V6. submit_writing inscrit bien le rendu dans le registre des copies.
select case when pg_get_functiondef(p.oid) like '%exam_attempts%'
            then 'OK — rendre un Writing debloque la suite'
            else 'PROBLEME' end as verification_6
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'submit_writing';
