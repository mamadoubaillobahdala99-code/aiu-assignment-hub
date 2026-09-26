-- ============================================================================
-- 23_storage_read.sql — F5, etape 1 : qui a le droit de LIRE un fichier
--
-- POURQUOI
-- L'etape 2 remplace les liens publics (valables pour toujours) par des
-- liens signes qui expirent au bout de 3 heures. Pour obtenir un lien
-- signe, le stockage verifie que la personne a le droit de lire le
-- fichier. Ce fichier ecrit ce droit.
--
-- LA REGLE, EN UNE PHRASE
-- On peut lire un fichier si on peut lire le devoir qui l'utilise.
-- Le fichier est cherche dans tous les endroits ou l'application enregistre
-- un fichier :
--     assignments.listening_audio_url      (audio unique du Listening)
--     assignments.image_url
--     exam_sections.audio_url / image_url  (audio d'une partie, image Writing)
--     exam_sections.documents              (documents du Speaking)
--     exam_sections.passage_text           (images [[image:...]] d'un Reading)
--     question_groups.image_url            (carte, plan, schema)
--     question_groups.passage_text
-- et le droit est celui de can_read_assignment, deja utilise partout :
--     - le prof proprietaire ;
--     - un prof invite sur la session d'examen ;
--     - l'etudiant inscrit dans la classe ;
--     - le candidat d'une session d'examen, SEULEMENT une fois l'epreuve
--       ouverte. Avant, il ne peut pas obtenir de lien pour l'audio.
-- Un anonyme (sans compte) n'a aucun droit.
--
-- La comparaison est EXACTE (le chemin, ou le lien public complet de ce
-- projet), jamais un "ressemble a" : un nom de fichier contient des "_",
-- qui sont des jokers pour LIKE.
--
-- CE QUI NE CHANGE PAS
-- L'espace reste public pour l'instant : les liens actuels marchent
-- toujours. Cette regle ne fait qu'AJOUTER la possibilite d'obtenir un
-- lien signe. Elle ne permet ni d'ecrire, ni de supprimer, ni de lister
-- les fichiers d'un autre (lister demande de connaitre le dossier, et
-- chaque ligne est verifiee par cette meme regle).
--
-- Ce script est re-executable sans danger.
-- ============================================================================

begin;

create or replace function public.can_read_storage_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with k as (
    select p_name as path,
           'https://bwfynibzijxuiitmdrtw.supabase.co/storage/v1/object/public/assignment-files/' || p_name as url
  )
  select coalesce(p_name, '') <> ''
  and (
    -- audio unique du Listening, image du devoir
    exists (
      select 1 from assignments a, k
      where (a.listening_audio_url in (k.path, k.url) or a.image_url in (k.path, k.url))
        and public.can_read_assignment(a.id)
    )
    -- audio d'une partie, image du Writing, images dans un passage
    or exists (
      select 1 from exam_sections s, k
      where (   s.audio_url in (k.path, k.url)
             or s.image_url in (k.path, k.url)
             or strpos(coalesce(s.passage_text, ''), '[[image:' || k.url || ']]') > 0
             or strpos(coalesce(s.passage_text, ''), '[[image:' || k.path || ']]') > 0)
        and public.can_read_assignment(s.assignment_id)
    )
    -- documents du Speaking
    or exists (
      select 1
      from exam_sections s, k,
           jsonb_array_elements(case when jsonb_typeof(s.documents) = 'array' then s.documents else '[]'::jsonb end) d
      where (d->>'path' = k.path or d->>'url' in (k.path, k.url))
        and public.can_read_assignment(s.assignment_id)
    )
    -- image d'un groupe de questions, images dans le texte d'un groupe
    or exists (
      select 1
      from question_groups g
      join exam_sections s on s.id = g.section_id, k
      where (   g.image_url in (k.path, k.url)
             or strpos(coalesce(g.passage_text, ''), '[[image:' || k.url || ']]') > 0
             or strpos(coalesce(g.passage_text, ''), '[[image:' || k.path || ']]') > 0)
        and public.can_read_assignment(s.assignment_id)
    )
  );
$$;

revoke all on function public.can_read_storage_file(text) from public;
revoke all on function public.can_read_storage_file(text) from anon;
grant execute on function public.can_read_storage_file(text) to authenticated;

drop policy if exists "readers read the files of what they can read" on storage.objects;
create policy "readers read the files of what they can read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'assignment-files'
    and public.can_read_storage_file(name)
  );

commit;

-- ============================================================================
-- Pour revenir en arriere (seulement si quelque chose n'allait pas) :
--
-- begin;
--   drop policy if exists "readers read the files of what they can read" on storage.objects;
--   drop function if exists public.can_read_storage_file(text);
-- commit;
-- ============================================================================
