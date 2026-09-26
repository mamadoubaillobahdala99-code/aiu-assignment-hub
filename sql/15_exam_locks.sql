-- =====================================================================
--  AIU Assignment Hub — les trois verrous de fin d'examen
--
--  LE PROBLEME (reproduit sur la vraie base avant d'ecrire ce fichier)
--  Un candidat qui n'avait JAMAIS compose pouvait, apres que le prof ait
--  ferme l'examen ET publie les resultats :
--     - relire l'epreuve  → oui
--     - lancer le chrono   → oui
--     - rendre ses reponses, notees normalement → oui
--  Autrement dit : composer apres la fin, tranquillement, chez soi.
--
--  LA CAUSE
--  exam_item_readable dit "si les resultats sont publies, tout redevient
--  lisible". C'etait voulu — pour que l'etudiant relise sa copie
--  corrigee. Mais "lisible" servait a DEUX choses tres differentes :
--     relire une copie rendue   et   composer.
--  La publication ouvrait les deux. Ce fichier les separe.
--
--  LES TROIS VERROUS
--  1. exam_item_startable : une nouvelle fonction qui dit si une epreuve
--     peut etre COMMENCEE. C'est exam_item_readable sans l'echappatoire
--     de la publication, et avec l'examen obligatoirement ouvert.
--  2. exam_timer_status : le chrono ne part plus que si l'epreuve est
--     "startable". Ferme ou publie → refus.
--  3. submit_student_answers : refuse les reponses apres la fermeture,
--     AVEC UNE EXCEPTION IMPORTANTE — un etudiant qui avait deja
--     commence son epreuve avant que le prof ferme peut encore la
--     rendre. Sinon celui qui ecrivait a l'instant du clic perdrait
--     tout son travail. On peut rendre une copie commencee avant la
--     fermeture ; on ne peut plus en commencer une nouvelle.
--
--  exam_item_readable n'est PAS modifiee : relire sa copie corrigee
--  apres publication continue de marcher exactement comme avant.
--  Les devoirs de classe ordinaire ne sont touches par rien de tout ca.
--
--  RELANCABLE. Ne supprime aucune donnee.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- VERROU 1 — "cette epreuve peut-elle etre COMMENCEE maintenant ?"
--
--   - il faut etre inscrit a la session ;
--   - la session doit etre ouverte (bouton du prof + creneau horaire) ;
--   - les resultats ne doivent pas etre publies : une fois publies,
--     l'examen est termine, plus personne ne compose ;
--   - toutes les epreuves precedentes doivent etre rendues ;
--   - celle-ci ne doit pas l'etre deja.
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
        where prev.session_id = i.session_id
          and prev.order_index < i.order_index
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

revoke all on function public.exam_item_startable(uuid) from public, anon;
grant execute on function public.exam_item_startable(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- VERROU 2 — le chronometre
--
--   Seul le demarrage (p_start = true) est verrouille. LIRE l'etat du
--   chrono reste permis : l'ecran l'interroge toutes les quelques
--   secondes, y compris a la seconde ou la copie est rendue.
-- ---------------------------------------------------------------------

create or replace function public.exam_timer_status(p_assignment_id uuid, p_start boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_student_id uuid := auth.uid();
  v_class_id   uuid;
  v_limit      integer;
  v_started    timestamptz;
  v_is_exam    boolean;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select class_id, time_limit_minutes into v_class_id, v_limit
  from assignments where id = p_assignment_id;
  if v_class_id is null then
    raise exception 'Assignment not found';
  end if;

  if not exists (select 1 from roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  if p_start then
    select (c.kind = 'exam') into v_is_exam from classes c where c.id = v_class_id;
    if coalesce(v_is_exam, false) and not public.exam_item_startable(p_assignment_id) then
      raise exception 'This part is not open';
    end if;

    -- The start time is written once, by the server clock. Calling this
    -- again (refresh, other device…) never changes it.
    insert into exam_attempts (assignment_id, student_id, started_at)
    values (p_assignment_id, v_student_id, now())
    on conflict (assignment_id, student_id) do nothing;
  end if;

  select started_at into v_started
  from exam_attempts
  where assignment_id = p_assignment_id and student_id = v_student_id;

  return jsonb_build_object(
    'started_at', v_started,
    'server_now', now(),
    'time_limit_minutes', v_limit
  );
end;
$function$;

revoke all on function public.exam_timer_status(uuid, boolean) from public, anon;
grant execute on function public.exam_timer_status(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- VERROU 3 — le rendu des reponses
--
--   Meme fonction qu'avant, a une seule addition pres : le bloc marque
--   NOUVEAU. Tout le reste est identique mot pour mot.
-- ---------------------------------------------------------------------

create or replace function public.submit_student_answers(p_assignment_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_student_id uuid := auth.uid();
  v_class_id   uuid;
  v_limit      integer;
  v_started    timestamptz;
  v_submitted  timestamptz;
  v_key        text;
  v_value      jsonb;
  v_qid        uuid;
  v_grade      record;
  v_count      integer := 0;
  v_exam       record;
  v_had_copy   boolean;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  select class_id, time_limit_minutes into v_class_id, v_limit
  from assignments where id = p_assignment_id;
  if v_class_id is null then
    raise exception 'Assignment not found';
  end if;

  if not exists (select 1 from roster r where r.class_id = v_class_id and r.student_id = v_student_id) then
    raise exception 'Not enrolled in this class';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Invalid answers';
  end if;
  if (select count(*) from jsonb_object_keys(p_answers)) > 500 or length(p_answers::text) > 200000 then
    raise exception 'Too many answers';
  end if;

  -- Avait-il DEJA une copie en cours avant cet appel ? La question doit
  -- etre posee ici, avant la ligne qui en cree une au besoin — c'est
  -- elle qui distingue "j'etais en train de composer" de "je n'ai
  -- jamais rien commence". On ne compare aucune heure : dans une meme
  -- transaction now() ne bouge pas, une comparaison d'horloge serait
  -- donc fragile. L'existence de la copie, elle, ne ment pas.
  select true into v_had_copy from exam_attempts
   where assignment_id = p_assignment_id and student_id = v_student_id;
  v_had_copy := coalesce(v_had_copy, false);

  -- The attempt row is locked for the whole submission, so two
  -- submissions at the same time can't both go through.
  insert into exam_attempts (assignment_id, student_id, started_at)
  values (p_assignment_id, v_student_id, now())
  on conflict (assignment_id, student_id) do nothing;

  select started_at, submitted_at into v_started, v_submitted
  from exam_attempts
  where assignment_id = p_assignment_id and student_id = v_student_id
  for update;

  if v_submitted is not null
     or exists (select 1 from student_answers sa where sa.assignment_id = p_assignment_id and sa.student_id = v_student_id) then
    raise exception 'Already submitted';
  end if;

  -- ------------------------------------------------------------------
  -- NOUVEAU. Si cette epreuve appartient a une session d'examen :
  --   - resultats publies  → l'examen est termine, plus aucun rendu ;
  --   - session fermee     → on n'accepte QUE les copies qui existaient
  --     deja avant cet appel. Celui qui ecrivait au moment du clic du
  --     prof garde son travail ; celui qui n'avait rien commence ne
  --     peut plus composer.
  -- ------------------------------------------------------------------
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
  end if;

  if v_limit is not null and now() > v_started + make_interval(mins => v_limit + 5) then
    raise exception 'Time is over';
  end if;

  for v_key, v_value in select key, value from jsonb_each(p_answers) loop
    begin
      v_qid := v_key::uuid;
    exception when others then
      raise exception 'Invalid question';
    end;

    -- The question must really belong to THIS assignment.
    if not exists (
      select 1
      from assignment_questions aq
      join exam_sections s on s.id = aq.section_id
      where aq.question_id = v_qid and s.assignment_id = p_assignment_id
    ) then
      raise exception 'Question not in this assignment';
    end if;

    select * into v_grade from grade_student_answer(v_qid, v_value);

    insert into student_answers (assignment_id, student_id, question_id, response, is_correct, points_earned)
    values (p_assignment_id, v_student_id, v_qid, v_value, v_grade.is_correct, v_grade.points_earned);
    v_count := v_count + 1;
  end loop;

  update exam_attempts
     set submitted_at = now()
   where assignment_id = p_assignment_id and student_id = v_student_id;

  -- Only the number of answers is returned — never which ones are right.
  return jsonb_build_object('submitted', v_count);
end;
$function$;

revoke all on function public.submit_student_answers(uuid, jsonb) from public, anon;
grant execute on function public.submit_student_answers(uuid, jsonb) to authenticated;

commit;

-- =====================================================================
--  VERIFICATIONS  (a lire, rien a faire)
-- =====================================================================

-- V1. Les trois fonctions sont en place et contiennent bien le verrou.
select p.proname as fonction,
  case
    when p.proname = 'exam_item_startable'     and pg_get_functiondef(p.oid) like '%results_released_at is null%' then 'OK'
    when p.proname = 'exam_timer_status'       and pg_get_functiondef(p.oid) like '%exam_item_startable%'         then 'OK'
    when p.proname = 'submit_student_answers'  and pg_get_functiondef(p.oid) like '%This exam is closed%'         then 'OK'
    else 'A REGARDER'
  end as verrou_en_place
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('exam_item_startable','exam_timer_status','submit_student_answers')
order by p.proname;

-- V2. Les droits : authenticated oui, anon non.
select p.proname as fonction,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon', p.oid, 'execute')          as anon
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('exam_item_startable','exam_timer_status','submit_student_answers')
order by p.proname;

-- V3. exam_item_readable n'a pas bouge : relire sa copie corrigee apres
--     publication fonctionne toujours.
select
  case when pg_get_functiondef(p.oid) like '%results_released_at is not null%'
       then 'OK — relire une copie publiee marche toujours'
       else 'PROBLEME — la relecture a ete cassee' end as verification_3
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'exam_item_readable';

-- V4. Aucune classe ordinaire n'est concernee : les verrous ne
--     s'appliquent qu'aux epreuves d'une session d'examen.
select count(*) filter (where kind = 'class') as classes_ordinaires_intactes,
       count(*) filter (where kind = 'exam')  as contenants_d_examen
from public.classes;
