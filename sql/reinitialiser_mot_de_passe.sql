-- =====================================================================
-- reinitialiser_mot_de_passe.sql — mot de passe PROVISOIRE (livraison 59)
--
-- Pour un compte qui a oublié son mot de passe, en attendant le vrai lien
-- « Forgot password? » par e-mail.
--
-- À lancer par Mamadou seulement, dans Supabase (SQL Editor).
--   1. Remplace <EMAIL> par l'adresse du compte (garder les ' ').
--   2. Remplace <MOT_DE_PASSE_PROVISOIRE> par un mot de passe NEUF qui
--      respecte la règle : au moins 8 caractères, au moins une lettre et
--      un chiffre (72 au plus). Pas un mot de passe déjà utilisé ailleurs.
--   3. Lance le script. Il affiche « OK : … a un mot de passe provisoire ».
--      Si l'adresse n'existe pas, ou si le mot de passe ne respecte pas la
--      règle, RIEN ne change et un message le dit.
--   4. Donne le mot de passe provisoire à la personne EN PRIVÉ.
--   5. La personne se connecte, puis le change TOUT DE SUITE dans son
--      Profil (« Change password »).
--
-- CE QUE LE SCRIPT CHANGE : uniquement le mot de passe chiffré du compte
-- (et sa date de mise à jour). Le rôle, le nom, les classes, les copies,
-- les résultats et la confirmation de l'e-mail ne changent pas.
--
-- PRÉCAUTIONS
--   - Le mot de passe provisoire reste lisible dans l'historique de l'éditeur
--     SQL de Supabase : c'est pour cela qu'il doit être changé tout de suite.
--   - Ne pas enregistrer ce script rempli (« Save ») ; ne jamais mettre une
--     vraie adresse ni un vrai mot de passe dans la version du dépôt GitHub.
-- =====================================================================

do $$
declare
  v_email    text := '<EMAIL>';
  v_password text := '<MOT_DE_PASSE_PROVISOIRE>';
  v_user     uuid;
  v_name     text;
begin
  if v_email = '<EMAIL>' or v_password = '<MOT_DE_PASSE_PROVISOIRE>' then
    raise exception 'Remplace <EMAIL> et <MOT_DE_PASSE_PROVISOIRE> avant de lancer le script.';
  end if;

  -- La même règle que le site (inscription et Profil).
  if length(v_password) < 8 then
    raise exception 'Mot de passe refusé : au moins 8 caractères. Rien n''a changé.';
  end if;
  if octet_length(v_password) > 72 then
    raise exception 'Mot de passe refusé : 72 caractères au plus. Rien n''a changé.';
  end if;
  if v_password !~ '[A-Za-z]' then
    raise exception 'Mot de passe refusé : il faut au moins une lettre. Rien n''a changé.';
  end if;
  if v_password !~ '[0-9]' then
    raise exception 'Mot de passe refusé : il faut au moins un chiffre. Rien n''a changé.';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(v_email));
  if v_user is null then
    raise exception 'Aucun compte avec l''adresse % : rien n''a changé.', v_email;
  end if;

  -- Le SEUL changement : le mot de passe (chiffré comme le fait Supabase,
  -- bcrypt coût 10), et la date de mise à jour du compte.
  update auth.users
     set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = v_user;

  -- ------------------------------------------------------------------
  -- OPTION — DÉCONNECTER LES AUTRES APPAREILS (désactivée par défaut)
  --
  -- Quand l'activer : seulement si le compte a peut-être été VOLÉ
  -- (quelqu'un d'autre connaît ou a utilisé le mot de passe). Pour un
  -- simple oubli, ce n'est pas utile.
  --
  -- Comment : enlever les deux tirets au début de la ligne « delete ».
  --
  -- Ce que ça fait : les appareils déjà connectés ne peuvent plus
  -- renouveler leur connexion. Mais un appareil garde l'accès jusqu'à la
  -- fin de son jeton en cours : au plus 1 heure avec le réglage par défaut
  -- de Supabase (Settings → JWT « expiry » = 3600 secondes ; si tu l'as
  -- changé, c'est cette durée-là).
  -- ------------------------------------------------------------------
  -- delete from auth.sessions where user_id = v_user;

  select p.name into v_name from public.profiles p where p.id = v_user;
  raise notice 'OK : % a un mot de passe provisoire. Il doit le changer tout de suite dans son Profil.', coalesce(v_name, v_email);
end $$;
