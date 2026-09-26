-- ============================================================================
-- 21_answer_matching.sql
--
-- CE QUI SE PASSAIT — mesure sur la vraie base avant d'ecrire ce fichier :
--   reponses de Listening rendues ......... 39
--   comptees justes ........................ 9
--   qui auraient du l'etre ................ 13
--   points perdus a tort ................... 4
--
-- Les quatre pertes venaient toutes de la meme chose. Sept des 63 cles de
-- Listening contenaient un CARACTERE INVISIBLE colle devant le mot, venu
-- du PDF au moment de l'import :
--      "<invisible>Central"   "<invisible>reception"
--      "<invisible>map"       "<invisible>July"
--      "<invisible>Albany"    "<invisible>0218 69345"
--      "<invisible> address"
-- Ces sept questions etaient IMPOSSIBLES a reussir, quoi que l'etudiant
-- tape. Aucune cle de Reading n'etait touchee.
--
-- POURQUOI CA PASSAIT
--   - Cote import, le texte colle est rogne avec .trim() — mais en
--     JavaScript, .trim() ne considere pas l'espace de largeur nulle
--     comme un espace : il n'enleve rien.
--   - Cote base, la comparaison faisait trim(both ' ') : elle n'enlevait
--     que l'espace ordinaire. Ni tabulation, ni retour a la ligne, ni
--     espace insecable, ni caractere invisible.
--
-- CE QUE FAIT CE FICHIER
--   1. Une fonction de normalisation, utilisee des DEUX cotes de la
--      comparaison : ce que l'etudiant tape et ce que le prof a enregistre.
--   2. grade_student_answer s'en sert pour les reponses a saisir.
--   3. Les sept cles deja en base sont reparees.
--
-- Les notes DEJA calculees ne sont pas retouchees : c'est voulu, la
-- correction est enregistree au moment du rendu.
--
-- Ce script est re-executable sans danger.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. La normalisation
--
--    Ce qui est neutralise : la casse, tout ce qui est invisible, toutes
--    les sortes d'espaces (insecable, tabulation, retour a la ligne,
--    espaces multiples), les apostrophes et guillemets courbes que les
--    claviers de telephone inserent automatiquement, et les differentes
--    sortes de tirets.
--
--    Ce qui n'est PAS touche : les accents et l'orthographe. En IELTS
--    l'orthographe compte — on corrige un probleme de clavier, pas le
--    niveau du candidat.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_answer_text(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(
    regexp_replace(                                   -- 5) espaces -> un seul
      regexp_replace(                                 -- 4) tirets -> "-"
        regexp_replace(                               -- 3) guillemets -> '"'
          regexp_replace(                             -- 2) apostrophes -> "'"
            regexp_replace(                           -- 1) invisibles -> rien
              lower(coalesce(p_text, '')),
              '[​-‏⁠﻿­]', '', 'g'),
            '[‘’‛′]', '''', 'g'),
          '[“”″]', '"', 'g'),
        '[‐-―−]', '-', 'g'),
      '[\s   　]+', ' ', 'g')
  );
$$;

revoke execute on function public.normalize_answer_text(text) from public, anon;
grant  execute on function public.normalize_answer_text(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. La correction
--
--    Seule la branche "reponse a saisir" (gap_fill) change. Les questions
--    a lettres (choix multiple, appariement, vrai/faux) ne sont pas
--    tapees par l'etudiant : il n'y a rien a normaliser, on n'y touche pas.
-- ---------------------------------------------------------------------------
create or replace function public.grade_student_answer(p_question_id uuid, p_response jsonb)
returns table(is_correct boolean, points_earned numeric, points_possible numeric)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_correct jsonb;
  v_type text;
  v_points_possible numeric;
  v_points_earned numeric;
  v_is_correct boolean;
  v_response_text text;
  v_accepted text[];
  v_correct_letters text[];
  v_response_letters text[];
begin
  select k.correct_answer, q.type, coalesce(q.points, 1)
    into v_correct, v_type, v_points_possible
  from public.question_answer_key k
  join public.questions q on q.id = k.question_id
  where k.question_id = p_question_id;

  if v_type = 'gap_fill' then
    -- MEME normalisation des deux cotes : ce que l'etudiant a tape et ce
    -- que le prof a enregistre. Une cle sale ne peut donc plus faire
    -- perdre un point, meme si une autre s'infiltre un jour.
    v_response_text := public.normalize_answer_text(coalesce(p_response #>> '{}', ''));

    select array_agg(public.normalize_answer_text(x)) into v_accepted
    from jsonb_array_elements_text(coalesce(v_correct, '[]'::jsonb)) as x;

    v_is_correct := v_response_text <> '' and v_response_text = any(v_accepted);
    v_points_earned := case when v_is_correct then v_points_possible else 0 end;

  elsif v_type = 'multiple_selection' then
    select array_agg(x) into v_correct_letters from jsonb_array_elements_text(coalesce(v_correct, '[]'::jsonb)) as x;
    select array_agg(x) into v_response_letters from jsonb_array_elements_text(coalesce(p_response, '[]'::jsonb)) as x;
    select count(*) into v_points_earned
    from unnest(coalesce(v_response_letters, '{}'::text[])) as r
    where r = any(coalesce(v_correct_letters, '{}'::text[]));
    v_points_earned := least(v_points_earned, v_points_possible);
    v_is_correct := v_points_earned = v_points_possible;

  else
    v_is_correct := (v_correct is not null and v_correct = p_response);
    v_points_earned := case when v_is_correct then v_points_possible else 0 end;
  end if;

  return query select v_is_correct, v_points_earned, v_points_possible;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Reparation des cles deja enregistrees
--
--    On enleve l'invisible et on remet les espaces d'aplomb. La casse est
--    conservee telle que le prof l'a saisie : elle s'affiche sur son
--    ecran de correction, et la comparaison l'ignore de toute facon.
-- ---------------------------------------------------------------------------
with nettoye as (
  select k.question_id,
         jsonb_agg(s.v order by s.ord) as cle
  from public.question_answer_key k
  join public.questions q on q.id = k.question_id
  cross join lateral (
    select btrim(
             regexp_replace(
               regexp_replace(x, '[​-‏⁠﻿­]', '', 'g'),
               '[\s   　]+', ' ', 'g')
           ) as v,
           ord
    from jsonb_array_elements_text(k.correct_answer) with ordinality as t(x, ord)
  ) s
  where q.type = 'gap_fill'
    and jsonb_typeof(k.correct_answer) = 'array'
    and k.correct_answer::text ~ '[​-‏⁠﻿­   　]'
    and s.v <> ''
  group by k.question_id
)
update public.question_answer_key k
   set correct_answer = n.cle
  from nettoye n
 where n.question_id = k.question_id;

commit;

-- ============================================================================
-- Verification (facultatif) : plus aucune cle ne doit contenir d'invisible.
--
-- select count(*) as cles_encore_sales
--   from public.question_answer_key k
--   join public.questions q on q.id = k.question_id
--  where q.type = 'gap_fill'
--    and k.correct_answer::text ~ '[​-‏⁠﻿­ ]';
-- ============================================================================
