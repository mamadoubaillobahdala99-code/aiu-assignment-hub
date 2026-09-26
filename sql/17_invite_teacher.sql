-- =====================================================================
--  AIU Assignment Hub — la fenetre "Inviter un prof" etait vide
--
--  CE QUI SE PASSAIT
--  L'ecran demandait a la base "donne-moi tous les profs". La base
--  repondait UNE SEULE personne : le prof connecte lui-meme. Comme il
--  est deja dans l'equipe de son examen, la fenetre le retirait de la
--  liste — et il ne restait rien. Fenetre vide, aucun message.
--
--  LA CAUSE, et elle est saine
--  Depuis l'etape 3 du durcissement, un profil n'est lisible que s'il
--  est le votre ou si la personne PARTAGE UNE CLASSE avec vous. Deux
--  profs qui ont chacun leur classe ne se voient donc pas. C'est la
--  bonne regle : sans elle, n'importe quel etudiant listerait tout le
--  monde.
--
--  LA REPARATION, choisie apres discussion
--  On ne touche PAS a la regle de lecture des profils. On ajoute une
--  porte etroite : une fonction qui renvoie les noms des profs
--  UNIQUEMENT a quelqu'un qui est deja prof d'une session d'examen, et
--  seulement pour cette session.
--
--    - un etudiant ne peut pas l'appeler : il n'est prof d'aucune
--      session, la fonction refuse ;
--    - un prof sans examen ne peut pas l'appeler non plus ;
--    - un prof qui organise un examen obtient la liste dont il a besoin
--      pour choisir sa collegue, et rien d'autre : un identifiant et un
--      nom. Aucune adresse, aucune donnee de classe, aucun eleve.
--
--  Ce que la fonction renvoie est donc strictement ce que l'ecran
--  affiche deja — pas une ligne de plus.
--
--  RELANCABLE. Ne supprime aucune donnee, ne modifie aucune donnee.
-- =====================================================================

begin;

create or replace function public.list_invitable_teachers(p_session_id uuid)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name
  from profiles p
  where public.is_exam_staff(p_session_id)          -- la porte
    and p.role = 'teacher'
    and p.id <> auth.uid()
    and not exists (select 1 from exam_session_staff s
                    where s.session_id = p_session_id and s.teacher_id = p.id)
  order by p.name;
$$;

revoke all on function public.list_invitable_teachers(uuid) from public, anon;
grant execute on function public.list_invitable_teachers(uuid) to authenticated;

commit;

-- =====================================================================
--  VERIFICATIONS  (a lire, rien a faire)
-- =====================================================================

-- V1. La fonction existe, et seulement pour les gens connectes.
select p.proname as fonction,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon', p.oid, 'execute')          as anon
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'list_invitable_teachers';

-- V2. La regle de lecture des profils n'a pas bouge d'un mot.
select policyname, qual
from pg_policies
where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT';

-- V3. La porte est bien dans la fonction : sans is_exam_staff, elle ne
--     renverrait jamais rien.
select case when pg_get_functiondef(p.oid) like '%is_exam_staff(p_session_id)%'
            then 'OK — reservee aux profs de la session'
            else 'PROBLEME — la porte manque' end as verification_3
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'list_invitable_teachers';
