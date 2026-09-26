-- =====================================================================
--  AIU Assignment Hub — le prof invite voyait des ecrans vides
--
--  CE QUI SE PASSAIT — reproduit sur la vraie base avant d'ecrire ce
--  fichier, avec un prof invite qui ne partage AUCUNE classe avec le
--  candidat :
--     lignes de presence visibles ......... 1
--     reponses du candidat ................ 1
--     copie rendue ........................ 1
--     NOM du candidat ..................... aucun
--  Les donnees etaient donc bien la. C'est le NOM qui manquait — et
--  comme chaque liste est construite a partir du nom, l'ecran paraissait
--  vide ou affichait "Unknown".
--
--  LA CAUSE
--  Un profil n'est lisible que par soi-meme ou par quelqu'un qui
--  PARTAGE UNE CLASSE (shares_class_with). Cette fonction ne connait
--  que les vraies classes. Le contenant d'un examen appartient a son
--  createur : un prof invite n'en est pas le proprietaire, donc il ne
--  partage rien, donc il ne voit aucun nom. C'est la meme famille que
--  la fenetre "Inviter un prof" qui etait vide.
--
--  Avec certaines personnes ca marchait par hasard — quand le prof
--  invite avait deja le candidat dans une de ses propres classes.
--
--  LA REPARATION
--  On ne touche PAS a la regle existante. On en AJOUTE une deuxieme, a
--  cote, qui n'accorde que ceci : "cette personne est candidate d'un
--  examen dont je suis prof" (et l'inverse, pour que le candidat voie
--  le nom du surveillant). Une regle ajoutee ne peut qu'ouvrir, jamais
--  casser ce qui marchait, et la portee est exactement celle de la
--  promesse faite dans la fenetre d'invitation.
--
--  RELANCABLE. Ne supprime et ne modifie aucune donnee.
-- =====================================================================

begin;

create or replace function public.shares_exam_with(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- je suis prof de la session, l'autre y est candidat
  select exists (
    select 1
    from exam_session_staff s
    join exam_sessions e on e.id = s.session_id
    join roster r on r.class_id = e.container_class_id
    where s.teacher_id = auth.uid() and r.student_id = p_user_id
  )
  -- ou je suis candidat, l'autre est prof de la session
  or exists (
    select 1
    from roster r
    join exam_sessions e on e.container_class_id = r.class_id
    join exam_session_staff s on s.session_id = e.id
    where r.student_id = auth.uid() and s.teacher_id = p_user_id
  );
$$;

revoke all on function public.shares_exam_with(uuid) from public, anon;
grant execute on function public.shares_exam_with(uuid) to authenticated;

drop policy if exists "profiles readable by exam staff" on public.profiles;
create policy "profiles readable by exam staff"
  on public.profiles for select
  using (public.shares_exam_with(id));

commit;

-- =====================================================================
--  VERIFICATIONS  (a lire, rien a faire)
-- =====================================================================

-- V1. Les deux regles coexistent, l'ancienne intacte.
select policyname, qual
from pg_policies
where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT'
order by policyname;

-- V2. La fonction et ses droits.
select p.proname as fonction,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon', p.oid, 'execute')          as anon
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'shares_exam_with';

-- V3. La portee : la nouvelle regle ne parle que de gens lies par une
--     session d'examen. Zero personne n'y entre autrement.
select
  (select count(*) from public.exam_session_staff) as profs_sur_des_examens,
  (select count(*) from public.roster r
     join public.exam_sessions e on e.container_class_id = r.class_id) as candidats_sur_des_examens;
