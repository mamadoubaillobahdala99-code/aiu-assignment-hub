-- =====================================================================
-- 43_exam_delete_lock.sql — livraison 64
-- Un examen EN COURS ne peut plus être supprimé, qu'il ait été ouvert par
-- le bouton « Open » OU par l'heure d'ouverture.
--
-- Avant : delete_exam_session (bouton « Delete this exam ») ne regardait
-- que le bouton (opened_at rempli, closed_at vide). Un examen ouvert par
-- l'heure pouvait donc être supprimé pendant qu'il tournait, avec toutes
-- les copies (prouvé sur la vraie base, transaction annulée).
--
-- LA MÊME DÉFINITION QU'AU 42 : exam_running(examen) = commencé (bouton
-- ou heure), pas fermé, pas publié, heure de fin pas encore atteinte.
--
-- CE QUE FAIT CE FICHIER
--   1. delete_exam_session : refuse si exam_running (même message
--      qu'avant : « This exam is running — close it first »). Le reste de
--      la fonction ne change pas.
--   2. Deuxième barrière : un déclencheur « avant suppression » sur
--      exam_sessions refuse de supprimer un examen EN COURS, quel que soit
--      le chemin (une autre fonction, une suppression en cascade de la
--      classe interne de l'examen…).
--   Un examen pas encore commencé, fermé, publié ou fini par l'heure se
--   supprime comme avant.
--
-- Script complet et ré-exécutable. Attendu : 5 lignes « OK ».
-- Retour arrière : bloc tout en bas.
-- =====================================================================

begin;

-- 1. Le bouton « Delete this exam ».
create or replace function public.delete_exam_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_src record; v_qids uuid[]; v_removed integer := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_src from exam_sessions where id = p_session_id;
  if not found then raise exception 'Exam not found'; end if;
  if v_src.created_by <> auth.uid() then raise exception 'Only the creator can delete this exam'; end if;
  -- NOUVEAU (43) : ouvert par le bouton OU par l'heure (même règle qu'au 42).
  if public.exam_running(p_session_id) then
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

revoke all on function public.delete_exam_session(uuid) from public, anon;
grant execute on function public.delete_exam_session(uuid) to authenticated;

-- 2. La deuxième barrière : pour TOUS les chemins.
create or replace function public.exam_session_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.exam_running(old.id) then
    raise exception 'This exam is running — close it first';
  end if;
  return old;
end $$;

-- Une fonction de déclencheur n'est appelée par personne directement.
revoke all on function public.exam_session_delete_guard() from public, anon, authenticated;

drop trigger if exists exam_session_delete_lock on public.exam_sessions;
create trigger exam_session_delete_lock
  before delete on public.exam_sessions
  for each row execute function public.exam_session_delete_guard();

commit;

-- ---------------------------------------------------------------------
-- CONTRÔLES (lecture seule) — chaque ligne doit afficher « OK »
-- ---------------------------------------------------------------------
select '1. le bouton « Delete » utilise exam_running (bouton ou heure)' as controle,
       case when (select prosrc from pg_proc where oid = 'public.delete_exam_session(uuid)'::regprocedure) like '%exam_running(p_session_id)%'
             and (select prosrc from pg_proc where oid = 'public.delete_exam_session(uuid)'::regprocedure) not like '%opened_at is not null%'
            then 'OK' else 'PROBLEME' end as resultat
union all
select '2. la deuxième barrière est posée (avant suppression sur exam_sessions)',
       case when exists (select 1 from pg_trigger
                         where tgname = 'exam_session_delete_lock' and tgenabled = 'O'
                           and tgrelid = 'public.exam_sessions'::regclass
                           and tgfoid = 'public.exam_session_delete_guard()'::regprocedure)
            then 'OK' else 'PROBLEME' end
union all
select '3. delete_exam_session : connectés seulement, jamais anon',
       case when has_function_privilege('authenticated', 'public.delete_exam_session(uuid)', 'execute')
             and not has_function_privilege('anon', 'public.delete_exam_session(uuid)', 'execute') then 'OK' else 'PROBLEME' end
union all
select '4. fonctions en « security definer », search_path = public ; déclencheur appelé par personne',
       case when (select count(*) from pg_proc
                  where oid in ('public.delete_exam_session(uuid)'::regprocedure,
                                'public.exam_session_delete_guard()'::regprocedure)
                    and prosecdef and proconfig @> array['search_path=public']) = 2
             and not has_function_privilege('anon', 'public.exam_session_delete_guard()', 'execute')
             and not has_function_privilege('authenticated', 'public.exam_session_delete_guard()', 'execute')
            then 'OK' else 'PROBLEME' end
union all
select '5. anon n''a toujours aucun droit sur les tables de public',
       case when not exists (select 1 from information_schema.role_table_grants
                             where table_schema = 'public' and grantee = 'anon') then 'OK' else 'PROBLEME' end;

/* =====================================================================
   RETOUR ARRIÈRE — remet delete_exam_session du 16 à l'identique et
   retire la deuxième barrière.

begin;

drop trigger if exists exam_session_delete_lock on public.exam_sessions;
drop function if exists public.exam_session_delete_guard();

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

revoke all on function public.delete_exam_session(uuid) from public, anon;
grant execute on function public.delete_exam_session(uuid) to authenticated;

commit;

   ===================================================================== */
