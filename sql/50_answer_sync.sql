-- =====================================================================
-- 50_answer_sync.sql — livraison 88c : la copie la plus récente gagne
-- =====================================================================
-- Ce que fait ce script :
--   1. save_answer_drafts : inchangée, sauf qu'elle répond aussi l'heure
--      (du serveur) de la sauvegarde. Les pages déjà ouvertes ignorent ce
--      champ : rien ne casse.
--   2. my_answer_draft_state (nouvelle) : l'élève lit l'heure de SA copie
--      de secours (et ses réponses), avec les mêmes règles que
--      my_answer_drafts du 49 : seulement la sienne, seulement tant qu'elle
--      n'est pas rendue. Sert à savoir quel appareil a sauvegardé en
--      dernier (tablette / ordinateur).
-- Ce qu'il ne fait PAS : aucune table, aucune règle RLS, aucun droit sur
-- les tables changés ; la nouvelle fonction : authenticated seulement,
-- jamais anon. Aucune donnée touchée.
-- Sécurité : UNE transaction ; garde-fou au début ; 4 vérifications à la
-- fin ; si une seule échoue, rien n'est changé. Ré-exécutable sans risque.
-- À lancer APRÈS le 49. Retour arrière : en bas, dans le bloc /* … */.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0. Garde-fou : la base doit être celle d'après le 49 (ou déjà passée
--    par ce script). Sinon : arrêt, rien n'est changé.
-- ---------------------------------------------------------------------
do $guard$
declare v text;
begin
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'  into v;
  if v is distinct from '65c8a9cc3b90733a70e8768f6a232aa4' then
    raise exception 'Les regles de securite ne sont pas celles attendues (empreinte %). Rien n''est change.', v;
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.save_answer_drafts(uuid,jsonb)'));
  if v is distinct from '7f8377818362011cd06120f46437d537' and v is distinct from 'c6de1c32035fa21e0f79e02b2c1fddfd' then
    raise exception 'save_answer_drafts n''est pas la version attendue (%). Lancer d''abord le 49. Rien n''est change.', v;
  end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.my_answer_drafts(uuid)')) is distinct from 'cf0706892958dd5ee78857dc89c1f8e4' or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.collect_class_papers(uuid)')) is distinct from 'a04886f30ab662396614f8eff1473a3b' then
    raise exception 'Le script 49 n''est pas en place. Rien n''est change.';
  end if;
  v := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.my_answer_draft_state(uuid,timestamptz)'));
  if v is not null and v is distinct from '2948d288f144ede18e77b7acc5ff8bcc' then
    raise exception 'my_answer_draft_state existe deja dans une autre version (%). Rien n''est change.', v;
  end if;
end $guard$;

-- ---------------------------------------------------------------------
-- 1. save_answer_drafts : rien ne change, sauf qu'elle répond aussi
--    l'heure du serveur de la sauvegarde (« at »). Les anciennes pages
--    ignorent ce champ.
-- ---------------------------------------------------------------------
create or replace function public.save_answer_drafts(p_assignment_id uuid, p_answers jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_student  uuid := auth.uid();
  v_type     text;
  v_limit    integer;
  v_session  uuid;
  v_released timestamptz;
  v_started  timestamptz;
  v_submitted timestamptz;
  v_class    uuid;
  v_kind     text;
  v_at       timestamptz;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;

  select a.type, a.time_limit_minutes into v_type, v_limit from assignments a where a.id = p_assignment_id;
  if v_type is null or v_type not in ('Reading', 'Listening') then
    raise exception 'Not a Reading or Listening paper';
  end if;

  select e.id, e.results_released_at into v_session, v_released
  from exam_session_items i join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;
  if v_session is null then
    -- NOUVEAU (49) : un devoir de classe ordinaire, pour un élève inscrit.
    select a.class_id, c.kind into v_class, v_kind
    from assignments a join classes c on c.id = a.class_id
    where a.id = p_assignment_id;
    if v_kind is distinct from 'class' then
      return jsonb_build_object('saved', false, 'reason', 'not_exam');
    end if;
    if not exists (select 1 from roster r where r.class_id = v_class and r.student_id = v_student) then
      raise exception 'Not enrolled in this class';
    end if;
  elsif not public.is_exam_candidate(v_session) then
    raise exception 'Not allowed';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'Invalid answers'; end if;
  if (select count(*) from jsonb_object_keys(p_answers)) > 500 or length(p_answers::text) > 200000 then
    raise exception 'Too many answers';
  end if;

  select started_at, submitted_at into v_started, v_submitted
  from exam_attempts where assignment_id = p_assignment_id and student_id = v_student;
  if v_started is null then return jsonb_build_object('saved', false, 'reason', 'not_started'); end if;
  if v_submitted is not null then return jsonb_build_object('saved', false, 'reason', 'submitted'); end if;
  if v_session is not null and (v_released is not null or not public.exam_is_open(v_session)) then
    return jsonb_build_object('saved', false, 'reason', 'closed');
  end if;
  if v_limit is not null and now() > v_started + make_interval(mins => v_limit + 5) then
    return jsonb_build_object('saved', false, 'reason', 'time');
  end if;

  insert into exam_answer_drafts (assignment_id, student_id, answers, updated_at)
  values (p_assignment_id, v_student, p_answers, now())
  on conflict (assignment_id, student_id) do update
    set answers = excluded.answers, updated_at = now()
  returning updated_at into v_at;

  -- NOUVEAU (50) : l'heure (du serveur) de cette sauvegarde.
  return jsonb_build_object('saved', true, 'at', v_at);
end $function$;

-- ---------------------------------------------------------------------
-- 2. my_answer_draft_state : la copie de secours de l'élève ET son heure.
--    Mêmes règles que my_answer_drafts (49) : seulement la sienne,
--    seulement tant qu'elle n'est pas rendue (et, pour un examen, tant
--    qu'il est ouvert). Avec p_since : les réponses ne sont renvoyées que
--    si la copie est PLUS RÉCENTE (un autre appareil a sauvegardé depuis).
-- ---------------------------------------------------------------------
create or replace function public.my_answer_draft_state(p_assignment_id uuid, p_since timestamptz default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_student   uuid := auth.uid();
  v_class     uuid;
  v_session   uuid;
  v_released  timestamptz;
  v_started   timestamptz;
  v_submitted timestamptz;
  v_answers   jsonb;
  v_at        timestamptz;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;
  select class_id into v_class from assignments where id = p_assignment_id;
  if v_class is null then return null; end if;
  if not exists (select 1 from roster r where r.class_id = v_class and r.student_id = v_student) then
    return null;
  end if;
  select started_at, submitted_at into v_started, v_submitted
  from exam_attempts where assignment_id = p_assignment_id and student_id = v_student;
  if v_started is null or v_submitted is not null then return null; end if;
  select e.id, e.results_released_at into v_session, v_released
  from exam_session_items i join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;
  if v_session is not null and (v_released is not null or not public.exam_is_open(v_session)) then
    return null;
  end if;
  select d.answers, d.updated_at into v_answers, v_at from exam_answer_drafts d
   where d.assignment_id = p_assignment_id and d.student_id = v_student;
  if v_at is null then return null; end if;
  return jsonb_build_object('at', v_at,
    'answers', case when p_since is null or v_at > p_since then v_answers else null end);
end $function$;

revoke all on function public.my_answer_draft_state(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.my_answer_draft_state(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Vérifications. Si une seule échoue : tout est annulé.
-- ---------------------------------------------------------------------
do $check$
declare v text; n int;
begin
  -- V1 : les fonctions sont exactement celles prévues.
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.save_answer_drafts(uuid,jsonb)')) is distinct from 'c6de1c32035fa21e0f79e02b2c1fddfd'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.my_answer_draft_state(uuid,timestamptz)')) is distinct from '2948d288f144ede18e77b7acc5ff8bcc'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.my_answer_drafts(uuid)')) is distinct from 'cf0706892958dd5ee78857dc89c1f8e4'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.collect_class_papers(uuid)')) is distinct from 'a04886f30ab662396614f8eff1473a3b' then
    raise exception 'V1 : une fonction n''est pas la version prevue.';
  end if;
  select count(*) into n from pg_proc
   where proname in ('save_answer_drafts', 'my_answer_draft_state')
     and pronamespace = 'public'::regnamespace
     and prosecdef and array_to_string(proconfig, ',') = 'search_path=public';
  if n <> 2 then raise exception 'V1 : securite des fonctions inattendue (% sur 2).', n; end if;

  -- V2 : droits : authenticated oui ; anon et public non.
  select count(*) into n from pg_proc p
   where p.proname in ('save_answer_drafts', 'my_answer_draft_state')
     and p.pronamespace = 'public'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'execute')
     and not has_function_privilege('anon', p.oid, 'execute');
  if n <> 2 then raise exception 'V2 : droits inattendus (% sur 2).', n; end if;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  if n <> 0 then raise exception 'V2 : anon peut lancer % fonction(s).', n; end if;

  -- V3 : règles RLS strictement inchangées ; RLS partout ; rien pour anon.
  select md5(string_agg(c.relname||'|'||p.polname||'|'||p.polcmd::text||'|'||p.polpermissive::text||'|'
      ||coalesce((select string_agg(rolname,',' order by rolname) from pg_roles r where r.oid = any(p.polroles)),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polqual,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),'')||'|'
      ||coalesce(replace(pg_get_expr(p.polwithcheck,p.polrelid),'( SELECT auth.uid() AS uid)','auth.uid()'),''), E'\n' order by c.relname, p.polname))
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'  into v;
  if v is distinct from '65c8a9cc3b90733a70e8768f6a232aa4' then raise exception 'V3 : les regles ont change (%).', v; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n <> 0 then raise exception 'V3 : % table(s) sans RLS.', n; end if;
  select count(*) into n from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon';
  if n <> 0 then raise exception 'V3 : anon a % droit(s) sur des tables.', n; end if;

  -- V4 : la table des copies de secours reste sans aucun droit direct.
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'exam_answer_drafts' and grantee in ('anon', 'authenticated');
  if n <> 0 then raise exception 'V4 : exam_answer_drafts a % droit(s) direct(s).', n; end if;

  raise notice '50 OK : 2 fonctions en place, 4 verifications passees.';
end $check$;

commit;

-- Message final : « 50 OK » seulement si les fonctions sont bien en place.
select case when (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.save_answer_drafts(uuid,jsonb)')) = 'c6de1c32035fa21e0f79e02b2c1fddfd' and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.my_answer_draft_state(uuid,timestamptz)')) = '2948d288f144ede18e77b7acc5ff8bcc'
            then '50 OK — 4 vérifications passées'
            else 'ÉCHEC — le 50 n''est pas en place (voir le message rouge plus haut)' end as resultat;


/* =====================================================================
   RETOUR ARRIÈRE (seulement pour revenir exactement à après le 49)
   Copier depuis la ligne « -- DÉBUT » jusqu'à la ligne « -- FIN » dans
   l'éditeur SQL de Supabase, puis Run.
   =====================================================================
-- DÉBUT
begin;

create or replace function public.save_answer_drafts(p_assignment_id uuid, p_answers jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_student  uuid := auth.uid();
  v_type     text;
  v_limit    integer;
  v_session  uuid;
  v_released timestamptz;
  v_started  timestamptz;
  v_submitted timestamptz;
  v_class    uuid;
  v_kind     text;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;

  select a.type, a.time_limit_minutes into v_type, v_limit from assignments a where a.id = p_assignment_id;
  if v_type is null or v_type not in ('Reading', 'Listening') then
    raise exception 'Not a Reading or Listening paper';
  end if;

  select e.id, e.results_released_at into v_session, v_released
  from exam_session_items i join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;
  if v_session is null then
    -- NOUVEAU (49) : un devoir de classe ordinaire, pour un élève inscrit.
    select a.class_id, c.kind into v_class, v_kind
    from assignments a join classes c on c.id = a.class_id
    where a.id = p_assignment_id;
    if v_kind is distinct from 'class' then
      return jsonb_build_object('saved', false, 'reason', 'not_exam');
    end if;
    if not exists (select 1 from roster r where r.class_id = v_class and r.student_id = v_student) then
      raise exception 'Not enrolled in this class';
    end if;
  elsif not public.is_exam_candidate(v_session) then
    raise exception 'Not allowed';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'Invalid answers'; end if;
  if (select count(*) from jsonb_object_keys(p_answers)) > 500 or length(p_answers::text) > 200000 then
    raise exception 'Too many answers';
  end if;

  select started_at, submitted_at into v_started, v_submitted
  from exam_attempts where assignment_id = p_assignment_id and student_id = v_student;
  if v_started is null then return jsonb_build_object('saved', false, 'reason', 'not_started'); end if;
  if v_submitted is not null then return jsonb_build_object('saved', false, 'reason', 'submitted'); end if;
  if v_session is not null and (v_released is not null or not public.exam_is_open(v_session)) then
    return jsonb_build_object('saved', false, 'reason', 'closed');
  end if;
  if v_limit is not null and now() > v_started + make_interval(mins => v_limit + 5) then
    return jsonb_build_object('saved', false, 'reason', 'time');
  end if;

  insert into exam_answer_drafts (assignment_id, student_id, answers, updated_at)
  values (p_assignment_id, v_student, p_answers, now())
  on conflict (assignment_id, student_id) do update
    set answers = excluded.answers, updated_at = now();

  return jsonb_build_object('saved', true);
end $function$;

drop function if exists public.my_answer_draft_state(uuid, timestamptz);

do $check$
begin
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.save_answer_drafts(uuid,jsonb)')) is distinct from '7f8377818362011cd06120f46437d537' then
    raise exception 'Retour arriere : save_answer_drafts inattendue. Rien n''est change.';
  end if;
  if to_regprocedure('public.my_answer_draft_state(uuid,timestamptz)') is not null then
    raise exception 'Retour arriere : la nouvelle fonction est encore la.';
  end if;
end $check$;

commit;
select case when (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.save_answer_drafts(uuid,jsonb)')) = '7f8377818362011cd06120f46437d537' and to_regprocedure('public.my_answer_draft_state(uuid,timestamptz)') is null
            then 'Retour arrière du 50 : OK' else 'ÉCHEC du retour arrière' end as resultat;
-- FIN
*/
