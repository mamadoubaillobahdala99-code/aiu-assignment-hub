-- =====================================================================
-- nommer_prof.sql — donner le rôle PROF à un compte (livraison 58)
--
-- À lancer par Mamadou seulement, dans Supabase (SQL Editor).
--   1. La personne crée d'abord son compte sur le site (elle est étudiante).
--   2. Remplace <EMAIL> ci-dessous par SON adresse e-mail (garder les ' ').
--   3. Lance le script. Il affiche le nom et le nouveau rôle.
--      Si l'adresse n'existe pas, rien ne change et un message le dit.
--   4. La personne se déconnecte puis se reconnecte : elle voit l'espace prof.
--
-- Ne pas enregistrer ce fichier avec une vraie adresse dans GitHub :
-- garder <EMAIL> dans la version du dépôt.
-- =====================================================================

do $$
declare
  v_email text := '<EMAIL>';
  v_name  text;
begin
  if v_email = '<EMAIL>' then
    raise exception 'Remplace <EMAIL> par l''adresse du prof avant de lancer le script.';
  end if;

  update public.profiles p
     set role = 'teacher'
    from auth.users u
   where u.id = p.id
     and lower(u.email) = lower(trim(v_email))
  returning p.name into v_name;

  if v_name is null then
    raise exception 'Aucun compte avec l''adresse % : rien n''a changé. La personne doit d''abord créer son compte sur le site.', v_email;
  end if;

  raise notice 'OK : % est maintenant prof.', v_name;
end $$;

-- Vérification : la liste des profs.
select p.name, p.role
from public.profiles p
where p.role = 'teacher'
order by p.name;

/* ---------------------------------------------------------------------
   RETIRER le rôle prof (si besoin) : même chose avec 'student'.
   Attention : ses classes et ses questions restent à son nom.

   update public.profiles p set role = 'student'
     from auth.users u
    where u.id = p.id and lower(u.email) = lower('<EMAIL>');
   --------------------------------------------------------------------- */
