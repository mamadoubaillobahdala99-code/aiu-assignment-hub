-- =====================================================================
-- 31_controle_apres.sql — livraison 46 — contrôle À LANCER APRÈS le script 31
-- Lecture seule : tout est annulé à la fin (rollback). Ne modifie rien.
-- On se met à la place de l'étudiant de test et on compte ce qu'il peut
-- lire DIRECTEMENT dans les tables alors qu'il ne peut pas ouvrir le paper.
-- Attendu : 0 partout -> « OK ».
-- Avant de lancer : remplacer <ID_ETUDIANT> par l'identifiant d'un étudiant de test.
-- =====================================================================
begin;
create temp table controle(n int, ce_qui_est_mesure text, nombre bigint);
grant all on controle to authenticated;
select set_config('request.jwt.claims', '{"sub":"<ID_ETUDIANT>","role":"authenticated"}', true);
set local role authenticated;
insert into controle
  select 1, 'groupes lisibles d''un paper que l''étudiant ne peut pas ouvrir', count(*)
  from question_groups g where not exists (select 1 from exam_sections s where s.id = g.section_id);
insert into controle
  select 2, 'questions lisibles d''un paper que l''étudiant ne peut pas ouvrir', count(*)
  from questions q
  where exists (select 1 from assignment_questions aq where aq.question_id = q.id)
    and not exists (select 1 from assignment_questions aq join exam_sections s on s.id = aq.section_id where aq.question_id = q.id);
insert into controle
  select 3, 'liens lisibles d''un paper que l''étudiant ne peut pas ouvrir', count(*)
  from assignment_questions aq where not exists (select 1 from exam_sections s where s.id = aq.section_id);
reset role;
select ce_qui_est_mesure, nombre, case when nombre = 0 then 'OK' else 'PROBLÈME' end as resultat
from controle order by n;
rollback;
