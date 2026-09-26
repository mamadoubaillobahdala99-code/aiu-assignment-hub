-- =====================================================================
--  AIU Assignment Hub — étape 3 des failles de sécurité
--
--  Ferme F6  (n'importe quel compte pouvait déposer un fichier
--             n'importe où dans le stockage),
--        F7  (deux fonctions appelables sans être connecté),
--        F8  (search_path modifiable sur handle_new_user),
--        F10 (nom et rôle de TOUS les utilisateurs visibles par tous),
--        F14 (le professeur ne pouvait pas lire les compteurs d'écoute),
--        F18 (aucune règle DELETE sur classes : supprimer une classe
--             ne faisait rien — le bouton existait pourtant).
--
--  F5 (le stockage est public en lecture) n'est PAS traité ici :
--  voir le LISEZ-MOI, c'est expliqué.
--  F11 est une case à cocher dans Supabase, pas du SQL : voir aussi.
--
--  Ce script est RELANÇABLE et ne supprime aucune donnée.
--  ATTENTION : ClassDetail.jsx et styles.js doivent être en ligne AVANT.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Fonctions d'aide
-- ---------------------------------------------------------------------

-- « Cette personne et moi partageons-nous une classe ? »
-- Vrai si je suis son professeur, ou si elle est mon professeur.
create or replace function public.shares_class_with(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes c join roster r on r.class_id = c.id
                 where c.teacher_id = auth.uid() and r.student_id = p_user_id)
      or exists (select 1 from roster r join classes c on c.id = r.class_id
                 where r.student_id = auth.uid() and c.teacher_id = p_user_id);
$$;

-- Le premier dossier d'un fichier est-il une classe à laquelle
-- j'appartiens ? (les enregistrements Speaking des étudiants et les
-- images des devoirs classiques vont dans <id de la classe>/…)
create or replace function public.can_write_class_file(p_folder text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  begin
    v := p_folder::uuid;
  exception when others then
    return false;   -- pas un identifiant de classe : refusé
  end;
  return public.is_class_teacher(v) or public.is_enrolled(v);
end $$;

revoke all on function public.shares_class_with(uuid)   from public, anon;
revoke all on function public.can_write_class_file(text) from public, anon;
grant execute on function public.shares_class_with(uuid)   to authenticated;
grant execute on function public.can_write_class_file(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. F10 — les profils.
--    Chacun voit le sien, le professeur voit ses étudiants, l'étudiant
--    voit son professeur. Rien de plus.
-- ---------------------------------------------------------------------

drop policy if exists "profiles viewable by authenticated users"   on public.profiles;
drop policy if exists "profiles readable by self or class members"  on public.profiles;
create policy "profiles readable by self or class members"
  on public.profiles for select
  using (id = auth.uid() or public.shares_class_with(id));

-- ---------------------------------------------------------------------
-- 3. F6 — le dépôt de fichiers.
--    Avant : « tout compte connecté peut écrire dans le bucket », sans
--    vérifier ni le dossier ni le rôle. Désormais chacun n'écrit que
--    dans ses propres dossiers.
-- ---------------------------------------------------------------------

drop policy if exists "authenticated users can upload assignment files" on storage.objects;
drop policy if exists "uploads limited to own folders"                   on storage.objects;
create policy "uploads limited to own folders"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assignment-files' and (
      -- la bibliothèque personnelle du professeur
      ( (storage.foldername(name))[1] in ('images','audio','speaking')
        and (storage.foldername(name))[2] = auth.uid()::text )
      -- ou le dossier d'une classe dont on fait partie
      or public.can_write_class_file((storage.foldername(name))[1])
    )
  );

-- ---------------------------------------------------------------------
-- 4. F7 et F8 — les fonctions exposées.
--    handle_new_user est une fonction de déclencheur : elle ne doit être
--    appelable par personne. record_audio_play reste réservée aux
--    comptes connectés.
-- ---------------------------------------------------------------------

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.record_audio_play(uuid, uuid, integer) from public, anon;
grant execute on function public.record_audio_play(uuid, uuid, integer) to authenticated;

-- F8 : fige le chemin de recherche sans toucher au corps de la fonction.
alter function public.handle_new_user() set search_path = public;

-- ---------------------------------------------------------------------
-- 5. F14 — le professeur lit les compteurs d'écoute de ses classes.
-- ---------------------------------------------------------------------

drop policy if exists "teachers read play counts in own classes" on public.listening_plays;
create policy "teachers read play counts in own classes"
  on public.listening_plays for select
  using (public.is_assignment_teacher(assignment_id));

-- ---------------------------------------------------------------------
-- 6. F18 — supprimer une classe.
--
--    ATTENTION : la suppression est EN CASCADE dans toute la base.
--    Supprimer une classe supprime ses devoirs, et chaque devoir emporte
--    les copies, les réponses, les textes de Writing, les notes, les
--    tentatives, les surlignages et les compteurs d'écoute.
--    Il n'y a ni corbeille ni sauvegarde.
--
--    C'est pourquoi cette règle ne doit être posée QU'AVEC le nouveau
--    ClassDetail.jsx en ligne : c'est lui qui affiche ce qui va
--    disparaître et demande de taper le nom de la classe quand elle
--    contient du travail d'étudiant.
-- ---------------------------------------------------------------------

drop policy if exists "teacher deletes own class" on public.classes;
create policy "teacher deletes own class"
  on public.classes for delete
  using (teacher_id = auth.uid());

commit;

-- =====================================================================
--  VÉRIFICATIONS — à lire après l'exécution
-- =====================================================================

-- V1. Les nouvelles règles sont en place.
select tablename, cmd, policyname from pg_policies
where schemaname in ('public','storage')
  and policyname in ('profiles readable by self or class members',
                     'uploads limited to own folders',
                     'teachers read play counts in own classes',
                     'teacher deletes own class')
order by tablename;
-- Attendu : les 4 lignes.

-- V2. Les fonctions exposées sont refermées.
select p.proname, array_to_string(p.proacl,' | ') as droits
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('handle_new_user','record_audio_play')
order by p.proname;
-- Attendu : handle_new_user sans anon ni authenticated ;
--           record_audio_play avec authenticated mais SANS anon.

-- V3. Le search_path de handle_new_user est figé.
select proname, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname='handle_new_user';
-- Attendu : proconfig contient search_path=public.

-- V4. Le test qui compte. (Transaction annulée : ne modifie rien.)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select 'un exterieur voit :' as test,
       (select count(*) from profiles) as profils,
       (select case when public.can_write_class_file((select id::text from classes limit 1))
               then 'OUI' else 'non' end) as peut_deposer_un_fichier;
rollback;
-- Attendu : 0 profil, et « non ».
