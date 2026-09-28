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
| `00_etat_actuel.sql` | **Photo de la base au 26/09/2026** (après 32 — les droits ont changé depuis avec le 33) : tables, contraintes, index, RLS, 60 fonctions, déclencheurs, 65 règles, droits, stockage. Aucune donnée. Voir section 3. |
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

**Autres éléments**

- Contrainte `exam_incidents_kind_check` : créée par 18, remplacée par 32 (ajoute `page_reload`).
- Règles « groups / links / questions readable by class members » : créées par 09, modifiées par 31.
- Règles supprimées par un script et absentes de la base (c'est voulu) :
  - les anciennes règles « … viewable by authenticated » (supprimées par 09, 10 et 11) ;
  - « students can join classes » (supprimée par 10) ;
  - « students see own answers » (supprimée par 09) ;
  - « authenticated users can upload assignment files » (supprimée par 11) ;
  - « anyone can view assignment files » (supprimée par 22).
- **Créé avant le 09**, donc absent des scripts de ce dossier, mais présent en base et dans `00_etat_actuel.sql` :
  - 5 fonctions : `handle_new_user`, `listening_audio_status`, `record_audio_play`, `save_writing_draft`, `submit_student_answer` ;
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

**5. Secrets**

Une recherche automatique de clés, jetons, mots de passe, e-mails et identifiants dans tout le dossier donne 0 résultat (hors les faux `11111111-…` et `<ID_ETUDIANT>`).

---

## 4. Règles pour les prochains scripts

1. Un nouveau script prend le numéro suivant (`46_…`) et s'ajoute ici avec une ligne dans le tableau.
2. Il est complet et ré-exécutable, avec un retour arrière dans un bloc `/* … */`.
3. Il est d'abord testé dans une transaction annulée, puis exécuté par Mamadou dans Supabase.
4. Nouvelles tables : droits pour `authenticated` seulement, jamais `anon`. La RLS n'est jamais affaiblie.
5. Après un script qui change la base, on peut régénérer `00_etat_actuel.sql` pour garder la photo à jour.
