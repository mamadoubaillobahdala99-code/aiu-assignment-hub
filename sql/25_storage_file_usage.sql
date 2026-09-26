-- ============================================================================
-- 25_storage_file_usage.sql — combien de devoirs utilisent un fichier ?
--
-- POURQUOI
-- Avant de supprimer un audio de sa bibliotheque, l'application doit
-- savoir s'il sert encore. Le navigateur du prof ne voit que SES devoirs :
-- il ne voit pas la copie d'un paper faite par une collegue (duplication
-- vers son examen), qui utilise pourtant le meme fichier. Supprimer le
-- fichier casserait l'audio de cette copie sans que personne soit prevenu.
--
-- CE QUE FAIT CE FICHIER
-- Une fonction qui COMPTE les devoirs qui utilisent un fichier, chez tous
-- les profs, et renvoie seulement deux nombres :
--     { "mine": <mes devoirs>, "others": <devoirs d'autres profs> }
-- Jamais un titre, jamais un nom.
-- Elle ne repond que pour ses PROPRES fichiers (dossier audio/<mon id>/,
-- images/<mon id>/, speaking/<mon id>/). Pour tout autre fichier, erreur.
-- Les endroits cherches sont les memes que dans 23_storage_read.sql.
--
-- Elle ne modifie rien (lecture seule) et ne change aucune regle de securite.
-- Ce script est re-executable sans danger.
-- ============================================================================

begin;

create or replace function public.storage_file_usage(p_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_path text := coalesce(p_name, '');
  v_url  text := 'https://bwfynibzijxuiitmdrtw.supabase.co/storage/v1/object/public/assignment-files/' || coalesce(p_name, '');
  v_mine integer;
  v_others integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if v_path = ''
     or not coalesce((storage.foldername(v_path))[1] = any (array['images', 'audio', 'speaking']), false)
     or (storage.foldername(v_path))[2] is distinct from auth.uid()::text then
    raise exception 'Not allowed';
  end if;

  with used as (
    select a.id
    from assignments a
    where a.listening_audio_url in (v_path, v_url) or a.image_url in (v_path, v_url)
    union
    select s.assignment_id
    from exam_sections s
    where s.audio_url in (v_path, v_url)
       or s.image_url in (v_path, v_url)
       or strpos(coalesce(s.passage_text, ''), '[[image:' || v_url || ']]') > 0
       or strpos(coalesce(s.passage_text, ''), '[[image:' || v_path || ']]') > 0
    union
    select s.assignment_id
    from exam_sections s,
         jsonb_array_elements(case when jsonb_typeof(s.documents) = 'array' then s.documents else '[]'::jsonb end) d
    where d->>'path' = v_path or d->>'url' in (v_path, v_url)
    union
    select s.assignment_id
    from question_groups g
    join exam_sections s on s.id = g.section_id
    where g.image_url in (v_path, v_url)
       or strpos(coalesce(g.passage_text, ''), '[[image:' || v_url || ']]') > 0
       or strpos(coalesce(g.passage_text, ''), '[[image:' || v_path || ']]') > 0
  )
  select count(*) filter (where c.teacher_id = auth.uid()),
         count(*) filter (where c.teacher_id is distinct from auth.uid())
    into v_mine, v_others
  from used u
  join assignments a on a.id = u.id
  join classes c on c.id = a.class_id;

  return jsonb_build_object('mine', coalesce(v_mine, 0), 'others', coalesce(v_others, 0));
end;
$$;

revoke all on function public.storage_file_usage(text) from public;
revoke all on function public.storage_file_usage(text) from anon;
grant execute on function public.storage_file_usage(text) to authenticated;

commit;

-- ============================================================================
-- Pour revenir en arriere :
--   drop function if exists public.storage_file_usage(text);
-- ============================================================================
