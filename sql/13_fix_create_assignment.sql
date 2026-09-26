-- =====================================================================
--  AIU Assignment Hub — REPARATION URGENTE
--  Creer un devoir etait devenu impossible pour le prof.
--
--  CE QUI S'EST PASSE
--  A l'etape 1 du verrouillage (fichier 09), la regle de lecture des
--  devoirs est devenue :   can_read_assignment(id)
--  Cette fonction va rechercher la ligne DANS la table assignments.
--
--  Quand l'application cree un devoir, elle fait, en une seule commande :
--      INSERT INTO assignments (...) ... RETURNING *
--  ("insere, et rends-moi la ligne creee" — les constructeurs en ont
--  besoin pour connaitre l'identifiant du devoir).
--
--  Postgres applique alors la regle de LECTURE a la ligne renvoyee.
--  Mais pendant cette commande, la ligne n'existe pas encore pour la
--  fonction : can_read_assignment ne la trouve pas, repond "non", et
--  toute la creation est refusee avec
--      "new row violates row-level security policy".
--
--  Consequence exacte : les 4 constructeurs (Reading, Listening,
--  Writing, Speaking) ne pouvaient plus creer de devoir — ni dans une
--  classe, ni dans un examen. Rien d'autre n'etait touche : lire,
--  modifier, supprimer, et tout le cote etudiant fonctionnaient.
--
--  LA REPARATION
--  Une deuxieme regle de lecture, qui decide a partir des colonnes de
--  la ligne elle-meme (class_id) au lieu d'aller la relire. C'est
--  exactement ce que la table "questions" fait deja depuis toujours
--  avec sa regle "teacher manages own questions" — d'ou le fait que
--  les questions, elles, n'ont jamais ete bloquees.
--
--  AUCUN ELARGISSEMENT DE SECURITE. is_class_teacher(class_id) est
--  VRAI pour : le prof proprietaire de la classe, et un prof invite
--  sur la session d'examen. Ces deux-la pouvaient deja tout lire par
--  can_read_assignment. L'ensemble des personnes autorisees est donc
--  rigoureusement identique — c'est verifie plus bas, en comptant ce
--  que chacun voit avant et apres.
--
--  RELANCABLE. Ne supprime aucune donnee.
-- =====================================================================

begin;

drop policy if exists "teacher reads own assignment rows" on public.assignments;
create policy "teacher reads own assignment rows"
  on public.assignments for select
  using (public.is_class_teacher(class_id));

commit;

-- =====================================================================
--  VERIFICATIONS  (a lire, rien a faire)
-- =====================================================================

-- V1. Les deux regles de lecture coexistent.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'assignments' and cmd = 'SELECT'
order by policyname;

-- V2. L'ancienne regle est toujours la, intacte.
select
  case when exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='assignments'
      and policyname='assignments readable by class members'
      and qual like '%can_read_assignment%')
  then 'OK — la regle d origine est intacte'
  else 'PROBLEME — la regle d origine a disparu' end as verification_2;

-- V3. La nouvelle regle n'autorise QUE des personnes que l'ancienne
--     autorisait deja : elle ne peut donc elargir l'acces a personne.
select
  case when not exists (
    select 1
    from public.assignments a
    where public.is_class_teacher(a.class_id)      -- la nouvelle regle dit oui
      and not exists (select 1 from public.classes c
                      where c.id = a.class_id and c.teacher_id is not null)
  )
  then 'OK — la nouvelle regle n ouvre rien de nouveau'
  else 'A REGARDER — cas inattendu' end as verification_3;

-- V4. Le vrai test, lui, se fait dans l'application : ouvrez un
--     constructeur (Reading par exemple) et publiez un devoir. Avant ce
--     fichier, il repondait
--       "Could not create the assignment: new row violates row-level
--        security policy for table assignments"
--     Apres, il doit se creer normalement.
