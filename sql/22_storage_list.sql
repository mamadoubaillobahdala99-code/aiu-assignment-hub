-- ============================================================================
-- 22_storage_list.sql — F5, etape 0 : on ne peut plus LISTER le stockage
--
-- CE QUI SE PASSAIT — verifie avant d'ecrire ce fichier, depuis le role
-- "anon" (un visiteur sans compte, avec la seule cle publique du site) :
--     fichiers listables sans compte ............ 21 sur 21
--     dont l'audio d'examen  audio/<prof>/audio_....mp3
-- La regle "anyone can view assignment files" s'appliquait a TOUT LE
-- MONDE (role "public"). Sans aucun lien, on pouvait donc decouvrir le nom
-- de chaque fichier, puis le telecharger — y compris l'audio d'un examen
-- avant qu'il ait lieu.
--
-- CE QUE FAIT CE FICHIER
-- La regle est remplacee par une autre, qui ne laisse voir la liste qu'a
-- un prof connecte, et seulement dans SES dossiers :
--     images/<son id>/   audio/<son id>/   speaking/<son id>/
-- Ce sont exactement les dossiers dans lesquels l'application ecrit, et
-- le seul endroit ou elle liste des fichiers (la bibliotheque audio du
-- prof). Televerser et supprimer ses propres fichiers continuent de
-- marcher : le stockage relit la ligne qu'il vient d'ecrire, et cette
-- ligne est dans un dossier du prof.
--
-- CE QUI NE CHANGE PAS
-- L'affichage. L'espace de stockage reste "public" pour l'instant, et
-- dans un espace public un lien direct ne passe par aucune regle (c'est
-- ecrit dans la documentation Supabase). Les audios et les images
-- s'affichent donc exactement comme avant.
--
-- CE QUE CA NE REGLE PAS ENCORE
-- Un lien deja connu marche toujours, et pour toujours. C'est la suite
-- du F5 (liens signes qui expirent, puis espace prive).
--
-- Ce script est re-executable sans danger.
-- ============================================================================

begin;

drop policy if exists "anyone can view assignment files" on storage.objects;

drop policy if exists "teachers list their own files" on storage.objects;
create policy "teachers list their own files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'assignment-files'
    and (storage.foldername(name))[1] = any (array['images', 'audio', 'speaking'])
    and (storage.foldername(name))[2] = (auth.uid())::text
  );

commit;

-- ============================================================================
-- Pour revenir en arriere (seulement si quelque chose n'allait pas) :
--
-- begin;
--   drop policy if exists "teachers list their own files" on storage.objects;
--   create policy "anyone can view assignment files" on storage.objects
--     for select using (bucket_id = 'assignment-files');
-- commit;
-- ============================================================================
