-- =====================================================================
--  AIU Assignment Hub — la surveillance pendant l'examen
--
--  CE QU'UNE PAGE WEB PEUT VRAIMENT FAIRE — et ce qu'elle ne peut pas.
--  On ne peut pas empecher une capture d'ecran, ni voir les extensions
--  du navigateur, ni savoir qu'un telephone est pose a cote. Aucun site
--  au monde ne le peut. On ne construit donc pas un mur : on construit
--  UNE TRACE ET UN GEL.
--
--    - le candidat quitte le plein ecran ou change d'onglet ;
--    - c'est enregistre ici, cote serveur ;
--    - en mode strict, sa copie se fige ;
--    - LE CHRONOMETRE, LUI, CONTINUE DE TOURNER (il est calcule depuis
--      l'heure de depart, personne ne peut l'arreter) ;
--    - il doit ecrire ce qui s'est passe ;
--    - il ne repart que si un prof l'autorise.
--
--  HONNETETE : c'est le navigateur de l'etudiant qui signale. Quelqu'un
--  de tres malin peut empecher le signalement — sans rien gagner de
--  plus, puisque le contenu des epreuves reste verrouille par les
--  regles deja en place. Le GEL, lui, vit sur le serveur : impossible
--  de se degeler soi-meme.
--
--  Ce que le prof obtient : la liste en direct des candidats geles avec
--  leur explication, un bouton pour les relancer, la possibilite de
--  redonner l'audio du Listening a quelqu'un qui l'a perdu, et un
--  rapport d'incidents a la fin.
--
--  RELANCABLE. Ne supprime aucune donnee.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Le registre des incidents
--
--    Une seule table. Un incident qui fige porte freezes = true ; il
--    reste "ouvert" tant que cleared_at est vide. Le candidat est donc
--    gele s'il a au moins un incident ouvert qui fige.
-- ---------------------------------------------------------------------

create table if not exists public.exam_incidents (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.exam_sessions(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete set null,
  kind          text not null,
  freezes       boolean not null default false,
  reason        text,
  at            timestamptz not null default now(),
  cleared_at    timestamptz,
  cleared_by    uuid references public.profiles(id)
);

do $$ begin
  alter table public.exam_incidents add constraint exam_incidents_kind_check
    check (kind in ('fullscreen_exit','tab_switch','paste','context_menu','copy'));
exception when duplicate_object then null; end $$;

create index if not exists idx_exam_incidents_session on public.exam_incidents(session_id, student_id);
create index if not exists idx_exam_incidents_open    on public.exam_incidents(session_id, student_id, cleared_at)
  where freezes;

alter table public.exam_incidents enable row level security;

-- Lecture : le candidat voit les siens, les profs de la session voient
-- tout. Personne n'ecrit directement : tout passe par les fonctions
-- ci-dessous, qui verifient qui fait quoi.
drop policy if exists "incidents readable by owner or exam staff" on public.exam_incidents;
create policy "incidents readable by owner or exam staff"
  on public.exam_incidents for select
  using (student_id = auth.uid() or public.is_exam_staff(session_id));

-- ---------------------------------------------------------------------
-- 2. Le candidat signale un incident
--
--    Le serveur decide seul s'il y a gel : jamais l'ecran. Un collage
--    ou un clic droit sont notes mais ne figent rien — ils sont deja
--    bloques dans la page, geler la salle pour un reflexe serait
--    absurde. Seuls la sortie du plein ecran et le changement d'onglet
--    figent, et seulement en mode strict.
-- ---------------------------------------------------------------------

create or replace function public.exam_report_incident(p_assignment_id uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := auth.uid();
  v_session uuid;
  v_strict  boolean;
  v_open    boolean;
  v_freezes boolean;
  v_already boolean;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('fullscreen_exit','tab_switch','paste','context_menu','copy') then
    raise exception 'Unknown incident';
  end if;

  select e.id, e.strict_mode, public.exam_is_open(e.id)
    into v_session, v_strict, v_open
  from exam_session_items i
  join exam_sessions e on e.id = i.session_id
  where i.assignment_id = p_assignment_id;

  -- Pas une epreuve d'examen : il n'y a rien a surveiller.
  if v_session is null then return jsonb_build_object('frozen', false, 'watched', false); end if;

  if not public.is_exam_candidate(v_session) then raise exception 'Not a candidate'; end if;

  v_freezes := v_strict and v_open and p_kind in ('fullscreen_exit','tab_switch');

  select exists (select 1 from exam_incidents x
                 where x.session_id = v_session and x.student_id = v_student
                   and x.freezes and x.cleared_at is null)
    into v_already;

  -- Deja gele : on n'empile pas les gels, sinon un seul aller-retour en
  -- produirait dix et le prof devrait cliquer dix fois.
  if v_freezes and v_already then
    return jsonb_build_object('frozen', true, 'watched', true);
  end if;

  -- Anti-bavardage : le meme type d'incident dans les 5 dernieres
  -- secondes ne cree pas une deuxieme ligne.
  if exists (select 1 from exam_incidents x
             where x.session_id = v_session and x.student_id = v_student
               and x.kind = p_kind and x.at > now() - interval '5 seconds') then
    return jsonb_build_object('frozen', v_already, 'watched', true);
  end if;

  insert into exam_incidents (session_id, student_id, assignment_id, kind, freezes)
  values (v_session, v_student, p_assignment_id, p_kind, v_freezes);

  return jsonb_build_object('frozen', v_freezes or v_already, 'watched', true);
end $$;

-- ---------------------------------------------------------------------
-- 3. Le candidat explique — obligatoire avant de demander la reprise
-- ---------------------------------------------------------------------

create or replace function public.exam_explain_incident(p_assignment_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_student uuid := auth.uid(); v_session uuid; v_text text; v_n integer;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;
  v_text := left(trim(coalesce(p_reason, '')), 500);
  if length(v_text) < 3 then raise exception 'A reason is required'; end if;

  select i.session_id into v_session
  from exam_session_items i where i.assignment_id = p_assignment_id;
  if v_session is null then raise exception 'Not an exam paper'; end if;
  if not public.is_exam_candidate(v_session) then raise exception 'Not a candidate'; end if;

  update exam_incidents
     set reason = v_text
   where session_id = v_session and student_id = v_student
     and freezes and cleared_at is null;
  get diagnostics v_n = row_count;

  return jsonb_build_object('explained', v_n > 0);
end $$;

-- ---------------------------------------------------------------------
-- 4. Ou en est le candidat ? (l'ecran le demande toutes les 5 secondes)
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 5. Le prof autorise la reprise
-- ---------------------------------------------------------------------

create or replace function public.exam_allow_resume(p_session_id uuid, p_student_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;

  update exam_incidents
     set cleared_at = now(), cleared_by = auth.uid()
   where session_id = p_session_id and student_id = p_student_id
     and freezes and cleared_at is null;
  get diagnostics v_n = row_count;

  return jsonb_build_object('resumed', v_n > 0);
end $$;

-- ---------------------------------------------------------------------
-- 6. Le prof redonne l'audio du Listening
--
--    Un candidat gele pendant l'enregistrement le perd : l'audio ne
--    l'attend pas. Ceci remet son compteur d'ecoutes a zero pour cette
--    epreuve — pour lui seul, et seulement sur decision du prof.
-- ---------------------------------------------------------------------

create or replace function public.exam_reset_audio(p_assignment_id uuid, p_student_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_n integer;
begin
  select i.session_id into v_session
  from exam_session_items i where i.assignment_id = p_assignment_id;
  if v_session is null then raise exception 'Not an exam paper'; end if;
  if not public.is_exam_staff(v_session) then raise exception 'Not allowed'; end if;

  delete from listening_plays
   where assignment_id = p_assignment_id and student_id = p_student_id;
  get diagnostics v_n = row_count;

  return jsonb_build_object('reset', v_n);
end $$;

-- ---------------------------------------------------------------------
-- 7. Le tableau de surveillance du prof, en un seul appel
-- ---------------------------------------------------------------------

create or replace function public.exam_invigilation_board(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_out jsonb; v_class uuid;
begin
  if not public.is_exam_staff(p_session_id) then raise exception 'Not allowed'; end if;
  select container_class_id into v_class from exam_sessions where id = p_session_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'student_id', t.student_id,
        'name',       t.name,
        'frozen',     t.frozen_since is not null,
        'since',      t.frozen_since,
        'kind',       t.frozen_kind,
        'reason',     t.reason,
        'incidents',  t.incidents,
        'freezes',    t.freezes)
      order by t.frozen_since nulls last, t.name),
    '[]'::jsonb)
  into v_out
  from (
    select
      p.id   as student_id,
      p.name as name,
      (select min(x.at) from exam_incidents x
        where x.session_id = p_session_id and x.student_id = p.id
          and x.freezes and x.cleared_at is null) as frozen_since,
      (select x.kind from exam_incidents x
        where x.session_id = p_session_id and x.student_id = p.id
          and x.freezes and x.cleared_at is null order by x.at limit 1) as frozen_kind,
      (select x.reason from exam_incidents x
        where x.session_id = p_session_id and x.student_id = p.id
          and x.freezes and x.cleared_at is null and x.reason is not null
        order by x.at limit 1) as reason,
      (select count(*) from exam_incidents x
        where x.session_id = p_session_id and x.student_id = p.id) as incidents,
      (select count(*) from exam_incidents x
        where x.session_id = p_session_id and x.student_id = p.id and x.freezes) as freezes
    from roster r
    join profiles p on p.id = r.student_id
    where r.class_id = v_class
  ) as t;

  return v_out;
end $$;

revoke all on function public.exam_report_incident(uuid, text)     from public, anon;
revoke all on function public.exam_explain_incident(uuid, text)    from public, anon;
revoke all on function public.exam_my_invigilation(uuid)           from public, anon;
revoke all on function public.exam_allow_resume(uuid, uuid)        from public, anon;
revoke all on function public.exam_reset_audio(uuid, uuid)         from public, anon;
revoke all on function public.exam_invigilation_board(uuid)        from public, anon;
grant execute on function public.exam_report_incident(uuid, text)  to authenticated;
grant execute on function public.exam_explain_incident(uuid, text) to authenticated;
grant execute on function public.exam_my_invigilation(uuid)        to authenticated;
grant execute on function public.exam_allow_resume(uuid, uuid)     to authenticated;
grant execute on function public.exam_reset_audio(uuid, uuid)      to authenticated;
grant execute on function public.exam_invigilation_board(uuid)     to authenticated;

commit;

-- =====================================================================
--  VERIFICATIONS  (a lire, rien a faire)
-- =====================================================================

-- V1. La table et sa regle de lecture.
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'exam_incidents';

-- V2. Personne ne peut ecrire dans le registre directement : il n'y a
--     aucune regle d'ecriture. Tout passe par les fonctions.
select case when not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='exam_incidents' and cmd <> 'SELECT')
  then 'OK — ecriture impossible en direct'
  else 'A REGARDER — une regle d ecriture existe' end as verification_2;

-- V3. Les six fonctions, et leurs droits.
select p.proname as fonction,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon', p.oid, 'execute')          as anon
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('exam_report_incident','exam_explain_incident','exam_my_invigilation',
                    'exam_allow_resume','exam_reset_audio','exam_invigilation_board')
order by p.proname;

-- V4. Le registre est vide au depart : ce fichier n'invente aucun
--     incident sur les examens deja passes.
select count(*) as incidents_enregistres from public.exam_incidents;
