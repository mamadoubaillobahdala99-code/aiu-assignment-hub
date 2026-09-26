-- ============================================================================
-- 24_storage_private.sql — F5, etape 4 : l'espace de stockage devient PRIVE
--
-- AVANT : l'espace "assignment-files" est public. Quiconque connait
-- l'adresse d'un fichier (par exemple l'audio d'un examen) peut le
-- telecharger, sans compte, et pour toujours.
--
-- APRES : une adresse publique ne marche plus. Le seul moyen de voir un
-- fichier est un lien signe de 3 heures, que le stockage donne seulement
-- a quelqu'un qui a le droit de lire le devoir qui l'utilise (regle de
-- 23_storage_read.sql) — ou au prof proprietaire du fichier.
--
-- VERIFIE AVANT D'ECRIRE CE FICHIER
--   - 23_storage_read.sql est bien en place (regle + fonction) ;
--   - le code en ligne sur GitHub est bien celui de la livraison 35 :
--     toutes les images, audios et documents passent par un lien signe ;
--   - il n'y a qu'un espace de stockage (assignment-files, 21 fichiers) ;
--   - aucune session d'examen n'est ouverte en ce moment ;
--   - essaye dans une transaction annulee : la modification passe.
--
-- CE QUI NE CHANGE PAS : televerser, lister sa bibliotheque audio,
-- supprimer ses fichiers. Rien n'est efface, aucun fichier ne bouge.
--
-- Ce script est re-executable sans danger.
-- ============================================================================

begin;

update storage.buckets
   set public = false
 where id = 'assignment-files';

commit;

-- Controle (doit afficher public = false) :
select id, public from storage.buckets where id = 'assignment-files';

-- ============================================================================
-- Pour revenir en arriere (tout redevient comme avant, immediatement) :
--
--   update storage.buckets set public = true where id = 'assignment-files';
-- ============================================================================
