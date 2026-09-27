-- =====================================================================
-- nommer_admin.sql — donner l'accès à l'écran « Admin » (livraison 60)
--
-- À lancer par Mamadou seulement, dans Supabase (SQL Editor), APRÈS le
-- script 39. Normalement une seule fois : pour son propre compte.
--   1. Remplace <EMAIL> ci-dessous par l'adresse du compte (garder les ' ').
--   2. Lance le script. Il affiche « OK : … est administrateur ».
--      Si l'adresse n'existe pas, rien ne change et un message le dit.
--   3. Recharge le site : l'entrée « Admin » apparaît dans le menu.
--
-- Être administrateur NE CHANGE PAS le rôle (prof ou étudiant).
-- Ne pas enregistrer ce fichier avec une vraie adresse dans GitHub.
-- =====================================================================

do $$
declare
  v_email text := '<EMAIL>';
  v_user  uuid;
  v_name  text;
begin
  if v_email = '<EMAIL>' then
    raise exception 'Remplace <EMAIL> par l''adresse du compte avant de lancer le script.';
  end if;

  select p.id, p.name into v_user, v_name
  from public.profiles p join auth.users u on u.id = p.id
  where lower(u.email) = lower(trim(v_email));

  if v_user is null then
    raise exception 'Aucun compte avec l''adresse % : rien n''a changé.', v_email;
  end if;

  insert into public.app_admins (user_id) values (v_user)
  on conflict (user_id) do nothing;

  raise notice 'OK : % est administrateur.', v_name;
end $$;

-- Vérification : la liste des administrateurs.
select p.name, a.added_at
from public.app_admins a join public.profiles p on p.id = a.user_id
order by a.added_at;

/* ---------------------------------------------------------------------
   RETIRER l'accès Admin à un compte (si besoin) :

   delete from public.app_admins a
    using auth.users u
    where u.id = a.user_id and lower(u.email) = lower('<EMAIL>');
   --------------------------------------------------------------------- */
