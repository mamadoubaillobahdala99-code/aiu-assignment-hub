-- =====================================================================
--  AIU Assignment Hub — le chrono obeit au verrou de l'examen
--
--  POURQUOI CE FICHIER
--  exam_timer_status() demarre le chronometre d'une epreuve. Jusqu'ici
--  elle verifiait une seule chose : l'etudiant est-il inscrit dans la
--  classe ? Dans une vraie classe c'est suffisant.
--
--  Dans une session d'examen, ca ne l'est plus : un candidat inscrit
--  est inscrit a TOUTES les epreuves de la session des qu'il rejoint.
--  Il ne pouvait pas LIRE l'epreuve 3 avant d'avoir rendu la 1 (le
--  verrou de lecture tient, il est verifie), mais il pouvait demarrer
--  son chronometre — donc perdre son temps sur une copie fermee.
--
--  Ce fichier ajoute une seule condition, au moment du DEMARRAGE :
--  si l'epreuve appartient a un contenant d'examen, elle doit etre
--  deverrouillee (exam_item_readable). Partout ailleurs, rien ne
--  change : une vraie classe se comporte exactement comme avant.
--
--  La condition ne porte QUE sur p_start = true. Simplement LIRE l'etat
--  du chrono (ce que fait l'ecran toutes les quelques secondes, y
--  compris juste apres avoir rendu la copie) reste permis, sinon
--  l'ecran afficherait une erreur au moment du rendu.
--
--  RELANCABLE. Ne supprime aucune donnee. Ne diminue aucune securite.
-- =====================================================================

begin;

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
    -- NOUVEAU. Dans une session d'examen, le chrono ne part que si
    -- l'epreuve est deverrouillee : les precedentes rendues, celle-ci
    -- pas encore. C'est la meme regle que la lecture du contenu.
    select (c.kind = 'exam') into v_is_exam from classes c where c.id = v_class_id;
    if coalesce(v_is_exam, false) and not public.exam_item_readable(p_assignment_id) then
      raise exception 'This part is not open yet';
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

-- Les droits restent exactement ceux d'avant (ni plus, ni moins).
revoke all on function public.exam_timer_status(uuid, boolean) from public, anon;
grant execute on function public.exam_timer_status(uuid, boolean) to authenticated;

commit;

-- =====================================================================
--  VERIFICATIONS  (a lire, rien a faire)
-- =====================================================================

-- V1. La fonction contient bien la nouvelle condition.
select
  case when pg_get_functiondef(p.oid) like '%exam_item_readable%'
       then 'OK — le chrono verifie le verrou'
       else 'PROBLEME — la condition manque' end as verification_1
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'exam_timer_status';

-- V2. Les droits sont inchanges : authenticated seulement.
select
  case when has_function_privilege('authenticated', p.oid, 'execute')
        and not has_function_privilege('anon', p.oid, 'execute')
       then 'OK — authenticated oui, anon non'
       else 'PROBLEME — droits inattendus' end as verification_2
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'exam_timer_status'
  and pg_get_function_identity_arguments(p.oid) = 'p_assignment_id uuid, p_start boolean';

-- V3. Aucune vraie classe n'est concernee : la condition ne s'applique
--     qu'aux contenants d'examen.
select count(*) filter (where kind = 'class') as vraies_classes_intactes,
       count(*) filter (where kind = 'exam')  as contenants_d_examen
from public.classes;
