-- =====================================================================
-- 34_exam_heartbeat.sql — livraison 55 (point 3 de la liste)
-- La page d'une épreuve surveillée apprend vite ce qui change sur le
-- serveur.
--
-- AVANT : pendant une épreuve, la page ne demandait son état au serveur
--   que lorsqu'elle signalait elle-même un incident, ou déjà gelée. Un gel
--   décidé ailleurs (le même paper rouvert dans un 2e onglet ou sur un
--   autre appareil) n'apparaissait pas sur la 1re page ; la fermeture de
--   l'examen par le prof, jamais.
-- MAINTENANT : la page pose la question toutes les 5 secondes (et tout de
--   suite quand on revient sur l'onglet), avec la fonction qui existe
--   déjà : exam_my_invigilation. Ce fichier lui fait répondre, EN PLUS de
--   ce qu'elle disait déjà (rien n'est retiré, les pages ouvertes sur
--   l'ancien site continuent de marcher) :
--     closed    — l'examen est fermé (ou pas encore / plus ouvert) ;
--     released  — les résultats sont publiés ;
--     submitted — cette épreuve est déjà rendue par l'étudiant.
--   Ces trois informations ne sont données qu'à un CANDIDAT de l'examen
--   (inscrit dans son conteneur) ; à tout autre compte : null.
--   (Elles serviront à la livraison 56 : « posez les stylos ».)
--
-- SÉCURITÉ : mêmes protections qu'avant — security definer,
--   search_path = public, exécutable par authenticated seulement ; elle ne
--   parle que de la personne connectée. Aucune table n'est modifiée.
--
-- Script complet et ré-exécutable. Attendu : 5 lignes « OK ».
-- À exécuter AVANT de coller les fichiers du site sur GitHub.
-- Retour arrière : bloc tout en bas.
-- =====================================================================

begin;

create or replace function public.exam_my_invigilation(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := auth.uid();
  v_session uuid; v_strict boolean; v_row record;
  v_candidate boolean; v_closed boolean; v_released boolean; v_submitted boolean;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;

  select e.id, e.strict_mode into v_session, v_strict
  from exam_session_items i join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;

  if v_session is null then
    -- Un devoir de classe ordinaire : aucune surveillance.
    return jsonb_build_object('watched', false, 'frozen', false, 'strict', false);
  end if;

  select x.at, x.kind, x.reason into v_row
  from exam_incidents x
  where x.session_id = v_session and x.student_id = v_student
    and x.freezes and x.cleared_at is null
  order by x.at limit 1;

  -- NOUVEAU (34) : l'état de l'examen, pour un candidat seulement.
  select exists (select 1 from exam_sessions e join roster r on r.class_id = e.container_class_id
                 where e.id = v_session and r.student_id = v_student)
    into v_candidate;
  if v_candidate then
    select not public.exam_is_open(e.id), e.results_released_at is not null
      into v_closed, v_released
    from exam_sessions e where e.id = v_session;
    select coalesce(bool_or(a.submitted_at is not null), false) into v_submitted
    from exam_attempts a where a.assignment_id = p_assignment_id and a.student_id = v_student;
  end if;

  return jsonb_build_object(
    'watched', true,
    'strict', v_strict,
    'frozen', v_row.at is not null,
    'since', v_row.at,
    'kind', v_row.kind,
    'reason', v_row.reason,
    'session_id', v_session,
    'closed', v_closed,
    'released', v_released,
    'submitted', v_submitted
  );
end $$;

-- Mêmes droits qu'avant (le « create or replace » les garde ; répétés ici
-- pour que le script reste juste même relancé ailleurs).
revoke all on function public.exam_my_invigilation(uuid) from public, anon;
grant execute on function public.exam_my_invigilation(uuid) to authenticated;

commit;

-- CONTRÔLES (lecture seule) — chaque ligne doit afficher « OK »
select 'exam_my_invigilation : une seule version (1 paramètre)' as controle,
       case when (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'exam_my_invigilation') = 1
             and (select pronargs from pg_proc where pronamespace = 'public'::regnamespace and proname = 'exam_my_invigilation') = 1
            then 'OK' else 'PROBLÈME' end as resultat
union all
select 'exam_my_invigilation : security definer + search_path = public',
       case when (select prosecdef and proconfig @> array['search_path=public'] from pg_proc
                  where pronamespace = 'public'::regnamespace and proname = 'exam_my_invigilation') then 'OK' else 'PROBLÈME' end
union all
select 'exam_my_invigilation : exécutable par authenticated seulement (ni public ni anon)',
       case when has_function_privilege('authenticated', 'public.exam_my_invigilation(uuid)', 'execute')
             and not has_function_privilege('anon', 'public.exam_my_invigilation(uuid)', 'execute')
             and not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                             where p.pronamespace = 'public'::regnamespace and p.proname = 'exam_my_invigilation'
                               and a.grantee = 0) then 'OK' else 'PROBLÈME' end
union all
select 'exam_my_invigilation : répond « closed / released / submitted »',
       case when pg_get_functiondef('public.exam_my_invigilation(uuid)'::regprocedure) like '%''closed''%'
             and pg_get_functiondef('public.exam_my_invigilation(uuid)'::regprocedure) like '%''submitted''%' then 'OK' else 'PROBLÈME' end
union all
select 'toujours rien pour anon sur les tables de public (script 33)',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLÈME' end;

/* =====================================================================
   RETOUR ARRIÈRE — remet exam_my_invigilation exactement comme le
   script 18 l'avait écrite. Les pages de la livraison 55 continuent de
   marcher (elles ignorent simplement les réponses absentes).
   Sélectionner de la ligne « begin; » à la ligne « commit; » puis Run.

begin;
create or replace function public.exam_my_invigilation(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_student uuid := auth.uid(); v_session uuid; v_strict boolean; v_row record;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;

  select e.id, e.strict_mode into v_session, v_strict
  from exam_session_items i join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;

  if v_session is null then
    -- Un devoir de classe ordinaire : aucune surveillance.
    return jsonb_build_object('watched', false, 'frozen', false, 'strict', false);
  end if;

  select x.at, x.kind, x.reason into v_row
  from exam_incidents x
  where x.session_id = v_session and x.student_id = v_student
    and x.freezes and x.cleared_at is null
  order by x.at limit 1;

  return jsonb_build_object(
    'watched', true,
    'strict', v_strict,
    'frozen', v_row.at is not null,
    'since', v_row.at,
    'kind', v_row.kind,
    'reason', v_row.reason,
    'session_id', v_session
  );
end $$;
revoke all on function public.exam_my_invigilation(uuid) from public, anon;
grant execute on function public.exam_my_invigilation(uuid) to authenticated;
commit;
   ===================================================================== */
