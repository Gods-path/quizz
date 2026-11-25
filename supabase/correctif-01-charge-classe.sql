-- ===========================================================================
--  CORRECTIF 01 — le quiz se figeait sur la question 1 avec toute une classe
-- ===========================================================================
--
--  A COLLER UNE SEULE FOIS dans Supabase > SQL Editor, puis « Run ».
--  Sans danger : aucune donnee n'est touchee, on ne change qu'un
--  declencheur. Vos quiz, vos parties et vos resultats restent en place.
--
--  LE PROBLEME
--  A la fin d'une question, le serveur ecrit le nouveau score de chaque
--  apprenant. Le declencheur qui tient a jour le nombre de joueurs se
--  reveillait a chacune de ces ecritures, parce que la colonne « removed »
--  fait partie des colonnes reecrites — meme quand sa valeur ne bouge pas.
--  Resultat mesure sur une classe de 20 : 21 modifications de la ligne de
--  la partie pour UNE question, donc 21 messages temps reel envoyes a
--  chacun des 20 telephones, soit plus de 800 appels au serveur. A 40
--  apprenants on depasse les 3 000 : tout se bloquait sur la question 1.
--
--  LA CORRECTION
--  Le declencheur ne se reveille plus que si « removed » a REELLEMENT
--  change, c'est-a-dire quand quelqu'un rejoint la partie ou en est retire.
-- ===========================================================================

-- Arrivees et departs : le nombre de joueurs doit etre recalcule.
drop trigger if exists players_refresh_count on players;
create trigger players_refresh_count
  after insert or delete on players
  for each row execute function refresh_player_count();

-- Retrait d'un apprenant par le formateur : seulement si la valeur change.
drop trigger if exists players_refresh_count_removed on players;
create trigger players_refresh_count_removed
  after update of removed on players
  for each row
  when (old.removed is distinct from new.removed)
  execute function refresh_player_count();

-- Verification : doit afficher exactement les deux lignes ci-dessus.
select tgname as declencheur
  from pg_trigger
 where tgrelid = 'players'::regclass
   and not tgisinternal
 order by tgname;
