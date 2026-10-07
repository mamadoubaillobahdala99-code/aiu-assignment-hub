# Dossier `sql/` — les scripts de la base Supabase

**Ce dossier est un rangement.** Tous ces scripts ont **déjà** été exécutés sur la base
(projet Supabase `bwfynibzijxuiitmdrtw`). **N'en relancez aucun sur la base actuelle.**
Ils servent à savoir ce qui a été fait, dans quel ordre, et pourquoi.

Aucun fichier ne contient de clé, de mot de passe, d'e-mail ou d'identifiant réel.
Les seuls identifiants sont des faux (`11111111-…`) dans les tests des scripts 09 à 11,
et `<ID_ETUDIANT>` dans `31_controle_apres.sql` (à remplacer avant de lancer ce contrôle).

Le fichier `supabase-schema.sql`, à la racine du dépôt, est le **tout premier** schéma.
Il est dépassé : ne pas l'exécuter. Il est gardé tel quel pour l'histoire.

---

## 1. L'ordre des scripts et à quoi sert chacun

| Fichier | À quoi il sert |
|---|---|
| `00_etat_actuel.sql` | **Photo de la base au 08/10/2026** (après le 52) : 26 tables, contraintes, index, RLS, 87 fonctions, déclencheurs, 63 règles (58 sur `public`, 5 sur le stockage), droits (dont « jamais anon » du 33 et les droits par défaut), stockage. Aucune donnée. Voir section 3. |
| `09_rls_exam_content.sql` | Sécurité, étape 1 : le contenu des examens n'est plus lisible par tout compte ; la correction n'est plus visible avant publication. |
| `10_rls_copies_classes.sql` | Sécurité, étape 2 : copies et notes privées, code de classe protégé, un étudiant ne peut plus se déclarer prof ni se noter. |
| `11_rls_storage_profiles.sql` | Sécurité, étape 3 : dépôt de fichiers limité à ses dossiers, profils visibles seulement entre membres d'une classe. |
| `12_exam_sessions.sql` | Les sessions d'examen : tables, code, verrou d'ordre des épreuves, conteneur privé. |
| `13_fix_create_assignment.sql` | Réparation : créer un devoir était devenu impossible (INSERT … RETURNING). |
| `14_exam_timer_lock.sql` | Le chrono ne démarre pas sur une épreuve encore verrouillée. |
| `15_exam_locks.sql` | Les trois verrous de fin d'examen (plus de composition après la fin). |
| `16_exam_manage.sql` | Gérer un examen : prof invité, dupliquer, renommer, supprimer, déclencheurs de protection. |
| `17_invite_teacher.sql` | La fenêtre « Inviter un prof » affiche enfin la liste des profs. |
| `18_invigilation.sql` | La surveillance : incidents, gel de la copie, tableau du prof, reprise autorisée. |
| `19_exam_staff_names.sql` | Le prof invité voit le nom des candidats. |
| `20_exam_staff_content.sql` | Le prof invité lit les questions, groupes et le conteneur. |
| `21_answer_matching.sql` | Réponses comparées sans caractères invisibles, apostrophes, tirets ni espaces en trop. |
| `22_storage_list.sql` | Plus personne ne liste le stockage (sauf le prof dans ses dossiers). |
| `23_storage_read.sql` | On lit un fichier seulement si on peut lire le paper qui l'utilise. |
| `24_storage_private.sql` | L'espace `assignment-files` devient privé (liens signés de 3 h). |
| `25_storage_file_usage.sql` | Compter les papers qui utilisent un fichier (avant de le supprimer). |
| `26_duplicate_assignment.sql` | Dupliquer un paper vers une classe ou un examen, en une fois. |
| `27_paper_editor.sql` | Éditeur de paper : niveaux 1/2/3 et enregistrement des modifications. |
| `28_paper_editor_delete_media.sql` | Éditeur, étape 2 : supprimer questions/groupes, audio et image. |
| `29_paper_editor_add_groups.sql` | Éditeur, étape 3 : ajouter des groupes à une partie. |
| `30_get_paper.sql` | `get_paper` : tout un paper en un seul appel, la RLS décide. |
| `31_lock_content_reads.sql` | Groupes, liens et questions lisibles seulement si le paper l'est ; `anon` ne lit plus le contenu. |
| `31_controle_apres.sql` | Contrôle (lecture seule, tout annulé) à lancer après le 31. |
| `32_exam_page_reload.sql` | F5 / 2e onglet pendant une épreuve : numéro d'écran, incident `page_reload`. |
| `33_revoke_anon.sql` | Règle « jamais anon » : aucun droit pour un visiteur non connecté sur les tables et fonctions de `public` ; `authenticated` perd TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ; mêmes règles **par défaut** pour les futures tables et fonctions. |
| `34_exam_heartbeat.sql` | Battement de cœur toutes les 5 s : `exam_my_invigilation` dit aussi au candidat si l'examen est fermé, libéré, ou sa copie rendue. |
| `35_pens_down.sql` | « Posez les stylos » : brouillons Reading/Listening gardés sur le serveur (`exam_answer_drafts`, sans aucun droit direct) ; *Close* et *Release* ramassent toutes les copies en cours ; les copies dont le temps est fini sont ramassées au passage (battement de cœur, tableau du prof). |
| `36_collect_safety.sql` | `submit_writing` verrouille la copie en premier (même ordre que le ramassage : plus de « deadlock » si l'étudiant remet pile au moment du ramassage) ; `exam_uncollected_papers` : nombre de copies pas encore ramassées alors qu'elles devraient l'être (staff seulement), affiché au prof. |
| `37_teacher_signup.sql` | Inscription = toujours étudiant (le rôle envoyé par la page est ignoré) ; `is_teacher()` ; il faut être prof pour créer une classe ou une question ; plus d'ajout ni de suppression de profil par les comptes connectés. |
| `38_exam_timer_rule.sql` | (29/09) Dans un paper d'examen, un appel au chrono sans numéro d'écran est refusé (« Please reload the page ») ; `exam_start_item` supprimée (plus utilisée) ; `exam_my_invigilation` ne répond qu'aux candidats et au staff de l'examen. |
| `39_admin_overview.sql` | Écran « Admin » (lecture seule) : table `app_admins` (aucun droit direct), `is_app_admin()`, `admin_overview()` réservée à l'administrateur — chiffres des profs, étudiants (chiffres seulement) et classes, liste des profs. |
| `nommer_admin.sql` | **Outil, pas une étape.** Donne l'accès à l'écran Admin à un compte (remplacer `<EMAIL>`), sans changer son rôle. Lancé par Mamadou seulement, une fois, après le 39. |
| `40_teacher_requests.sql` | Demande d'accès prof : table `teacher_requests` (aucun droit direct) ; case à l'inscription (`handle_new_user`, ne peut jamais faire échouer une inscription) ; `request_teacher_access()` (nouvelle demande 7 jours après un refus) ; `my_teacher_request()` ; `admin_decide_teacher_request()` réservée à l'admin (seulement une demande en attente ; « Approve » seulement si le compte est encore étudiant) ; `admin_overview()` liste les demandes en attente. |
| `41_exam_lock.sql` | Verrou des tables de l'examen : épreuves seulement de la classe interne de l'examen et seulement avant le début (seul l'ordre est modifiable) ; fiche d'examen : seuls strict / départ du Listening / heures d'ouverture et de fin modifiables directement, et pas pendant l'examen ; `exam_extend_end` (reculer l'heure de fin seulement) ; profs de l'examen : seulement des profs « co », le créateur reste ; plus d'écriture directe sur incidents, copies, écoutes. |
| `42_paper_lock.sql` | Verrou du contenu des épreuves d'examen : pendant l'examen (ouvert par le bouton OU par l'heure), plus rien ne change dans une épreuve (durée, parties, groupes, questions, corrigé) — même par « Edit » ; après la fermeture, on corrige et l'éditeur recalcule ; une épreuve d'un examen commencé ne se supprime plus (seul l'examen entier se supprime) ; « Publish » marche toujours ; une seule définition de « examen commencé » (`exam_not_started` du 41) pour l'éditeur, la duplication et le verrou. |
| `43_exam_delete_lock.sql` | Un examen EN COURS (ouvert par le bouton OU par l'heure) ne peut plus être supprimé : `delete_exam_session` utilise `exam_running` (même définition qu'au 42) + déclencheur « avant suppression » sur `exam_sessions` (2e barrière, tous les chemins). Un examen pas commencé, fermé, publié ou fini par l'heure se supprime comme avant. |
| `44_class_overview.sql` | Les chiffres de la page d'une classe (prof) en une lecture : rendus par devoir (« 8/12 »), copies Writing à corriger, devoirs rendus par étudiant, devoir construit ou non. Fonction `class_overview` en LECTURE SEULE (stable), réservée au prof de la classe (« Not allowed » sinon, jamais anon, jamais la boîte privée d'un examen) ; que des nombres, aucune réponse ni note. Mêmes règles de « rendu » que la page d'un devoir. |
| `45_teacher_overview.sql` | Le tableau de bord du prof et ses cartes « My classes » en une lecture, pour toutes ses classes : étudiants, devoirs, copies Writing à corriger (et la plus ancienne), rendus par devoir, copies rendues sur 7 jours, activité récente (« X a rendu… », « X a rejoint… »). Fonction `teacher_overview` en LECTURE SEULE (stable) : seulement les classes de l'appelant, jamais la boîte privée d'un examen, jamais anon ; nombres, heures et noms des étudiants de ses classes, aucune réponse ni note. Mêmes règles de « rendu » que le 44. |
| `46_everyone_together.sql` | « Everyone together » (livraison 79) : réglage de l'examen `start_mode` (`individual` par défaut — tous les examens existants inchangés — ou `together`). En mode together, « Open » ouvre la salle d'attente et le prof lance chaque épreuve pour tous (`exam_session_action` 'start_item') : même départ, même fin ; un retardataire a le temps restant ; une épreuve jamais commencée dont le temps est fini est « manquée » ; 'free' laisse chacun continuer seul. Minutes offertes par candidat : `exam_give_extra_time` (staff, 1–60 min), notées dans `exam_extra_time` (RLS, lecture staff seulement, aucune écriture directe). Règles seulement RESSERRÉES : contenu illisible avant le Start, heure de départ écrite par le serveur ; `listening_audio_status` ne crée plus de copie hors des règles. Retour arrière complet (versions exactes d'avant). À lancer AVANT : `46_test_annule.sql` (tout le script + 36 vérifications dans une transaction annulée ; attendu « RESULTATS : 36 OK / 0 KO », la base ne change pas). |
| `47_rls_speed.sql` | La base plus rapide, sécurité IDENTIQUE (livraison 84) : 22 index sur des colonnes de liaison (ex. `roster.student_id`, `exam_attempts.student_id`, `classes.teacher_id`) et 35 règles RLS réécrites avec `(select auth.uid())` au lieu de `auth.uid()` (conseil Supabase « auth_rls_initplan » : la valeur est lue une fois par requête au lieu d'une fois par ligne). Aucune règle ajoutée, retirée ou élargie, aucun droit changé. Garde-fou au début (les 62 règles doivent être exactement celles d'avant, empreinte `5647f84a…`), 4 vérifications à la fin (dont : en remettant `auth.uid()`, on retrouve EXACTEMENT les 62 règles d'avant). Ré-exécutable. Retour arrière exact en bas (testé : empreinte d'origine retrouvée). À lancer AVANT : `47_test_annule.sql` (5 comptes réels, 27 tables : mêmes lignes visibles, mêmes modifications / suppressions / ajouts possibles avant et après, dans une transaction annulée ; attendu « RESULTATS : 445 OK / 0 KO », la base ne change pas). |
| `48_cleanup_feedback.sql` | Nettoyage + notes (livraison 86) : supprime l'ANCIEN système de rendu, vide et plus utilisé — table `submissions` (avec ses 4 règles, son déclencheur, ses index), fonctions `submissions_guard()` et `submit_student_answer(uuid, uuid, jsonb)` (`is_assignment_teacher` est gardée : la règle de `listening_plays` s'en sert). Resserre `assignment_feedback` : un prof (ou un prof d'examen) ne peut plus créer ni modifier une note que pour un élève INSCRIT dans la classe du devoir — seule la partie « with check » change ; lire et supprimer ne changent pas ; aucune ligne existante touchée. Garde-fou au début (règles d'avant, empreinte `5647f84a…`, ou d'après, `65c8a9cc…` ; table `submissions` vide), 5 vérifications à la fin. Ré-exécutable. Retour arrière exact en bas (testé : tout revient à l'identique). Après le 48, ne plus relancer le 47 (son garde-fou l'arrête, sans rien changer). À lancer AVANT : `48_test_annule.sql` (crée une classe, un devoir et un examen de test avec 2 profs et 3 élèves existants, 16 essais avant et après le 48, dans une transaction annulée ; attendu « RESULTATS : 37 OK / 0 KO » ; seuls 4 essais changent : une note pour un compte non inscrit devient refusée). |
| `49_answer_backup.sql` | Les réponses ne se perdent plus (livraison 88) : la copie de secours des réponses Reading / Listening (envoyée toutes les 5 s) marche aussi pour un devoir de CLASSE (`save_answer_drafts` ; pour un examen rien ne change). Nouvelle `my_answer_drafts(uuid)` : l'élève relit SA copie de secours tant qu'elle n'est pas rendue (autre ordinateur). Nouvelle `collect_class_papers(uuid)` : un devoir de classe chronométré dont le temps (+ 5 min) est fini et jamais rendu est rendu avec sa copie de secours, heure de remise = fin du temps — par l'élève (la sienne) ou par un prof de la classe (toutes) ; jamais pour un examen. Aucune table, aucune règle RLS, aucun droit de table changés ; les 2 nouvelles fonctions : `authenticated` seulement, jamais `anon`. Garde-fou au début (règles `65c8a9cc…`, versions des fonctions), 4 vérifications à la fin. Ré-exécutable. Retour arrière exact en bas (testé). À lancer AVANT : `49_test_annule.sql` (transaction annulée ; attendu « RESULTATS : 29 OK / 0 KO »). |
| `50_answer_sync.sql` | La copie la plus récente gagne (livraison 88c) : `save_answer_drafts` répond aussi l'heure (du serveur) de la sauvegarde ; nouvelle `my_answer_draft_state(uuid, timestamptz)` : l'élève lit l'heure de SA copie de secours et ses réponses (mêmes règles que `my_answer_drafts` du 49 ; avec une heure donnée, les réponses ne sont renvoyées que si la copie est plus récente). Sert à reprendre sur un autre appareil la version la plus récente (tablette ↔ ordinateur) et à mettre à jour une page restée ouverte. Aucune table, aucune règle RLS, aucun droit de table changés ; nouvelle fonction : `authenticated` seulement, jamais `anon`. À lancer APRÈS le 49 (garde-fou). 4 vérifications, ré-exécutable, retour arrière exact en bas (testé). À lancer AVANT : `50_test_annule.sql` (transaction annulée ; attendu « RESULTATS : 23 OK / 0 KO »). |
| `51_task_feedback.sql` | Un commentaire par tâche en Writing (livraison 89) : nouvelle colonne `writing_grades.task_feedback` (texte, 5 000 caractères au plus) — le commentaire du prof pour la Task 1 ou la Task 2 ; le commentaire général (`assignment_feedback.feedback`) ne change pas. Aucune règle RLS, aucun droit, aucune fonction changés : les règles existantes s'appliquent (l'élève ne le lit qu'après la publication ; seuls les profs de la classe ou de l'examen l'écrivent). 4 vérifications, ré-exécutable, retour arrière en bas (efface les commentaires par tâche). À lancer AVANT : `51_test_annule.sql` (transaction annulée ; attendu « RESULTATS : 14 OK / 0 KO »). |
| `52_exam_integrity.sql` | La BASE tient les règles d'examen (livraison 94) — avant, la page les tenait, mais pas un appel direct à la base. **B1 gel** : pendant un gel du surveillant, rien n'est enregistré (Reading / Listening : `saved:false, reason:'frozen'` ; Writing : erreur « Frozen… », la page réessaie et enregistre dès que le prof clique « Let back in ») ; une remise Reading / Listening pendant un gel remet la copie de secours d'AVANT le gel. **B2 fin** : « fermé » = bouton Close OU heure de fin passée ; Writing d'examen : examen ouvert et épreuve commencée obligatoires ; une remise après la fin n'est acceptée que 2 min (copie déjà commencée). **B3** : marge réseau après la fin du temps 2 min au lieu de 5 (sauvegardes, remises et les 3 ramassages : `exam_collect_papers`, `exam_uncollected_papers`, `collect_class_papers`). **B5** : règle RLS des corrigés RESSERRÉE (`sa.assignment_id = a.id` : le corrigé seulement pour l'épreuve où l'élève a répondu). **B7** : nouvelle garde `assignment_class_lock` (déclencheur) : une épreuve ne change plus de classe depuis le site. **B8** : `join_exam` refuse un NOUVEAU candidat après la publication. 7 fonctions réécrites (mêmes droits), 1 garde (lancée par personne), 1 règle resserrée ; aucune table, colonne, donnée ni droit de table changés. Garde-fou au début, 6 vérifications à la fin, ré-exécutable, retour arrière exact en bas (testé : empreintes d'origine retrouvées). À lancer AVANT : `52_test_annule.sql` (transaction annulée ; attendu « RESULTATS : 49 OK / 0 KO »). |
| `nommer_prof.sql` | **Outil, pas une étape.** Donne le rôle prof à un compte existant (remplacer `<EMAIL>`). Lancé par Mamadou seulement ; ne jamais enregistrer une vraie adresse dans le dépôt. |
| `reinitialiser_mot_de_passe.sql` | **Outil, pas une étape.** Donne un mot de passe provisoire (règle : 8+ caractères, une lettre, un chiffre) à un compte qui a oublié le sien ; ne change rien d'autre. Option commentée : déconnecter les autres appareils (compte volé). Lancé par Mamadou seulement ; ne jamais enregistrer une vraie adresse ni un vrai mot de passe dans le dépôt. |

**Ce qui manque :** les scripts d'avant le 09 (01 à 08) n'ont pas été retrouvés.
Ce qu'ils ont créé est dans `00_etat_actuel.sql` (voir section 2, dernier point).

---

## 2. Ce qui a été remplacé depuis par un script plus récent

Un script plus récent a réécrit ces éléments. **La version en base est toujours celle du dernier script.**

**Fonctions**

| Fonction | Écrite par | Version en base |
|---|---|---|
| `save_paper_edits` | 27 → 28 → 29 | 29 |
| `exam_timer_status` | 14 → 15, puis **supprimée** et recréée avec `p_page` | 32 |
| `can_read_question`, `can_read_section` | 09 → 20 → 31 | 31 |
| `can_read_assignment` | 09 → 12 | 12 |
| `is_class_teacher`, `join_class` | 10 → 12 | 12 |
| `exam_item_readable` | 12 → 16 | 16 |
| `exam_item_startable` | 15 → 16 | 16 |
| `save_answer_drafts` | 35 → 49 → 50 → 52 | 52 |
| `submit_student_answers` | 15 → 52 | 52 |
| `save_writing_draft` | avant le 09 → 52 | 52 |
| `exam_collect_papers` | 35 → 52 | 52 |
| `exam_uncollected_papers` | 36 → 52 | 52 |
| `collect_class_papers` | 49 → 52 | 52 |
| `join_exam` | 12 → 52 | 52 |

**Autres éléments**

- Contrainte `exam_incidents_kind_check` : créée par 18, remplacée par 32 (ajoute `page_reload`).
- Règles « groups / links / questions readable by class members » : créées par 09, modifiées par 31.
- Règles supprimées par un script et absentes de la base (c'est voulu) :
  - les anciennes règles « … viewable by authenticated » (supprimées par 09, 10 et 11) ;
  - « students can join classes » (supprimée par 10) ;
  - « students see own answers » (supprimée par 09) ;
  - « authenticated users can upload assignment files » (supprimée par 11) ;
  - « anyone can view assignment files » (supprimée par 22).
- **Supprimé par le 48** (ancien système de rendu, vide) : la table `submissions` et ses 4 règles, son déclencheur
  `trg_submissions_guard`, les fonctions `submissions_guard` et `submit_student_answer`.
- **Créé avant le 09**, donc absent des scripts de ce dossier, mais présent en base et dans `00_etat_actuel.sql` :
  - 1 fonction encore dans sa version d'origine : `record_audio_play`
    (`handle_new_user` a été réécrite par le 37 puis le 40, `listening_audio_status` par le 46,
    `submit_student_answer` supprimée par le 48, `save_writing_draft` réécrite par le 52) ;
  - 30 règles RLS ;
  - les tables d'origine.

---

## 3. Comment chaque fichier a été vérifié contre la base (26/09/2026)

Tout a été fait **en lecture seule** : rien n'a été exécuté ni modifié dans Supabase.

**1. Fonctions**

- Le texte de chaque fonction écrite par les scripts a été comparé à celui de la base, avec une empreinte md5 (espaces et fins de ligne ignorés).
- Résultat : **55 fonctions sur 55 identiques** à la version du dernier script qui les écrit.

**2. Règles RLS**

Chaque règle créée par les scripts a été comparée à la base :

- 33 sont identiques.
- 2 sont réécrites par Postgres dans une forme équivalente : la colonne est préfixée par le nom de la table, et `IN (…)` devient `= ANY (ARRAY[…])`.
- Toutes les règles supprimées par un script sont bien absentes de la base.

**3. Tables, index, déclencheurs et contraintes créés par les scripts**

Ils sont tous présents en base.

**4. `00_etat_actuel.sql`**

- Il a été chargé dans une base PostgreSQL **vide**, hors Supabase, puis comparé à la vraie base avec les mêmes empreintes.
- Sont **identiques** :
  - les 23 tables et leurs colonnes ;
  - les 60 fonctions (en-têtes, corps et droits) ;
  - les 65 règles ;
  - les droits sur les tables et le stockage ;
  - la RLS sur les 23 tables ;
  - le déclencheur `on_auth_user_created`.
- Une seule différence d'écriture : la contrainte `writing_grades_scores` est réécrite par Postgres avec moins de parenthèses. Le sens est identique.

**4 bis. `00_etat_actuel.sql` régénéré le 07/10/2026 (livraison 89, après le 51 ; même méthode qu'aux livraisons 86, 88 et 88c)**

- Fabriqué automatiquement à partir du catalogue d'une copie locale de la base, après avoir vérifié que cette copie
  était IDENTIQUE à la vraie base (empreintes md5 : règles, fonctions, droits des tables, des colonnes et des
  fonctions, colonnes, contraintes, index, déclencheurs, règles du stockage), puis les scripts 49, 50 et 51 appliqués.
- Rechargé dans une base PostgreSQL **vide** : il reconstruit exactement la même chose (mêmes empreintes, partout).
- Comparé ensuite à la vraie base, après que Mamadou a lancé le 51 (voir la livraison 89).
- Ce qui vient directement de la vraie base (Postgres 17) car la copie locale (Postgres 16) l'écrit autrement :
  le texte de la contrainte `writing_grades_scores`, la liste des extensions et les droits par défaut.
- La ligne « Source » de chaque fonction = le dernier script du dossier qui la crée (les retours arrière entre
  `/* … */` ne comptent pas).

**4 ter. `00_etat_actuel.sql` régénéré le 08/10/2026 (livraison 94, après le 52)**

- Même méthode : copie locale IDENTIQUE à la vraie base (empreintes), puis le 52 appliqué ; rechargé dans une base vide :
  mêmes empreintes partout (règles `683bb7fe…`, fonctions `6ac63da8…`, déclencheurs `db2cbc37…`, droits des tables inchangés `7285f854…`).
- À comparer à la vraie base après que Mamadou a lancé le 52.

**5. Secrets**

Une recherche automatique de clés, jetons, mots de passe, e-mails et identifiants dans tout le dossier donne 0 résultat (hors les faux `11111111-…` et `<ID_ETUDIANT>`).

---

## 4. Règles pour les prochains scripts

1. Un nouveau script prend le numéro suivant (`53_…`) et s'ajoute ici avec une ligne dans le tableau.
2. Il est complet et ré-exécutable, avec un retour arrière dans un bloc `/* … */`.
3. Il est d'abord testé dans une transaction annulée, puis exécuté par Mamadou dans Supabase.
4. Nouvelles tables : droits pour `authenticated` seulement, jamais `anon`. La RLS n'est jamais affaiblie.
5. Après un script qui change la base, on peut régénérer `00_etat_actuel.sql` pour garder la photo à jour.
