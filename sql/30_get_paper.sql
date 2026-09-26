-- =====================================================================
-- 30_get_paper.sql — livraison 44, étape 1
-- Charger un paper en UN seul appel au lieu de 13 à 16 requêtes en escalier.
--
-- get_paper(p_assignment_id, p_with_keys) renvoie tout le paper en JSON :
--   { "assignment": {...},
--     "sections": [ { ...partie..., "groups": [ { ...groupe..., "questions": [ {...}, ... ] } ] } ],
--     "answer_keys": { "<question_id>": <correct_answer>, ... }   -- seulement si p_with_keys
--   }
--
-- SÉCURITÉ
--   * SECURITY INVOKER : la fonction s'exécute avec les droits de la personne
--     connectée. Chaque table est lue à travers ses politiques RLS actuelles,
--     exactement comme les anciennes requêtes. Elle ne peut rien montrer de plus.
--   * Les bonnes réponses ne sont ajoutées que si p_with_keys = true (aperçu du
--     prof), et même alors la RLS de question_answer_key filtre : un étudiant
--     sans correction publiée ne reçoit rien.
--   * Paper introuvable ou non lisible -> null.
--   * Droits : authenticated seulement (jamais anon, jamais public).
--
-- Même contenu et même ordre que l'ancien chargement : parties par order_index,
-- groupes par order_index, questions de chaque groupe par order_index.
-- Les questions sont atteintes par leur groupe (group_id), comme avant.
--
-- Script complet et ré-exécutable.
-- =====================================================================

create or replace function public.get_paper(p_assignment_id uuid, p_with_keys boolean default false)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with a as (
    select to_jsonb(x) as j
    from assignments x
    where x.id = p_assignment_id
  ),
  q as (
    select aq.group_id, aq.order_index, aq.question_id, to_jsonb(qq) as j
    from exam_sections s
    join question_groups g        on g.section_id = s.id
    join assignment_questions aq  on aq.group_id  = g.id
    join questions qq             on qq.id        = aq.question_id
    where s.assignment_id = p_assignment_id
  )
  select case when not exists (select 1 from a) then null else
    jsonb_build_object(
      'assignment', (select j from a),
      'sections', coalesce((
        select jsonb_agg(
                 to_jsonb(s) || jsonb_build_object('groups', coalesce((
                   select jsonb_agg(
                            to_jsonb(g) || jsonb_build_object('questions', coalesce((
                              select jsonb_agg(q.j order by q.order_index, q.question_id)
                              from q where q.group_id = g.id
                            ), '[]'::jsonb))
                            order by g.order_index, g.id)
                   from question_groups g
                   where g.section_id = s.id
                 ), '[]'::jsonb))
                 order by s.order_index, s.id)
        from exam_sections s
        where s.assignment_id = p_assignment_id
      ), '[]'::jsonb),
      'answer_keys', case when p_with_keys then coalesce((
        select jsonb_object_agg(k.question_id, k.correct_answer)
        from question_answer_key k
        where k.question_id in (select question_id from q)
      ), '{}'::jsonb) else null end
    )
  end;
$$;

revoke all on function public.get_paper(uuid, boolean) from public, anon;
grant execute on function public.get_paper(uuid, boolean) to authenticated;

-- =====================================================================
-- RETOUR ARRIÈRE (à exécuter seulement pour annuler cette livraison) :
--
--   drop function if exists public.get_paper(uuid, boolean);
--
-- Le site reprend alors tout seul l'ancien chargement (filet dans
-- TeacherPaperPreview.jsx). Aucune table n'est modifiée par ce script.
-- =====================================================================
