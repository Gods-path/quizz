-- ============================================================================
--  QUIZ EN DIRECT - Schema de la base de donnees
--  A coller dans Supabase : tableau de bord > SQL Editor > New query > Run
--  Ce script peut etre relance sans danger (il ne detruit rien).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
--  1. Les quiz et leurs questions  (PRIVES : jamais lus par un navigateur)
-- ----------------------------------------------------------------------------

create table if not exists quizzes (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null check (char_length(title) between 1 and 120),
  total_duration_minutes int  not null check (total_duration_minutes between 1 and 600),
  created_at             timestamptz not null default now()
);

create table if not exists questions (
  id               uuid primary key default gen_random_uuid(),
  quiz_id          uuid not null references quizzes(id) on delete cascade,
  position         int  not null check (position >= 0),
  theme            text,
  domaine          text,
  text             text not null,
  -- [{"letter":"A","text":"..."}, ...]  2 a 4 propositions
  options          jsonb not null,
  -- {"B"} ou {"A","C"}
  correct_letters  text[] not null check (array_length(correct_letters, 1) >= 1),
  duration_seconds int  not null check (duration_seconds >= 5),
  explanation      text,
  unique (quiz_id, position)
);

create index if not exists questions_quiz_idx on questions (quiz_id, position);

-- ----------------------------------------------------------------------------
--  2. Les parties  (PUBLIQUES EN LECTURE : c'est l'etat du jeu, diffuse en
--     direct aux deux ecrans. Aucune donnee secrete ici.)
-- ----------------------------------------------------------------------------

create table if not exists games (
  id                        uuid primary key default gen_random_uuid(),
  code                      text not null unique,
  quiz_id                   uuid not null references quizzes(id) on delete cascade,
  quiz_title                text not null,
  question_count            int  not null default 0,
  -- lobby = salle d'attente | question = en cours | reveal = correction | finished
  phase                     text not null default 'lobby'
                              check (phase in ('lobby','question','reveal','finished')),
  current_index             int  not null default 0,
  -- heure SERVEUR du debut de la question : seule source de verite du chrono
  question_started_at       timestamptz,
  question_duration_seconds int,
  paused_at                 timestamptz,
  pause_total_ms            int  not null default 0,
  answered_count            int  not null default 0,
  player_count              int  not null default 0,
  pass_threshold            int  not null default 72 check (pass_threshold between 0 and 100),
  mock_mode                 boolean not null default true,
  created_at                timestamptz not null default now(),
  ended_at                  timestamptz
);

create index if not exists games_code_idx    on games (code);
create index if not exists games_created_idx on games (created_at desc);

-- ----------------------------------------------------------------------------
--  3. Les joueurs  (PUBLICS EN LECTURE : nom, score, rang. Pas de secret.)
-- ----------------------------------------------------------------------------

create table if not exists players (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references games(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 24),
  score          int  not null default 0,
  streak         int  not null default 0,
  best_streak    int  not null default 0,
  correct_count  int  not null default 0,
  answered_count int  not null default 0,
  removed        boolean not null default false,
  joined_at      timestamptz not null default now()
);

create index if not exists players_game_idx on players (game_id);
-- deux "Marie" impossibles dans la meme partie (insensible a la casse)
create unique index if not exists players_game_name_uniq on players (game_id, lower(name));

-- ----------------------------------------------------------------------------
--  4. Le jeton secret de chaque joueur, dans sa propre table PRIVEE.
--     C'est ce qui permet la reconnexion sans jamais exposer le jeton via
--     Realtime (Realtime diffuse des lignes entieres).
-- ----------------------------------------------------------------------------

create table if not exists player_secrets (
  player_id  uuid primary key references players(id) on delete cascade,
  token_hash text not null
);

-- ----------------------------------------------------------------------------
--  5. Les reponses  (PRIVEES : les voir reviendrait a connaitre la solution)
-- ----------------------------------------------------------------------------

create table if not exists answers (
  id               uuid primary key default gen_random_uuid(),
  game_id          uuid not null references games(id) on delete cascade,
  player_id        uuid not null references players(id) on delete cascade,
  question_id      uuid not null references questions(id) on delete cascade,
  question_index   int  not null,
  selected_letters text[] not null default '{}',
  is_correct       boolean not null,
  points           int  not null default 0,
  streak_bonus     int  not null default 0,
  response_ms      int,
  created_at       timestamptz not null default now(),
  -- une seule reponse par joueur et par question : pas de double soumission
  unique (player_id, question_index)
);

create index if not exists answers_game_idx on answers (game_id, question_index);

-- ----------------------------------------------------------------------------
--  6. Compteurs tenus a jour par la base (ils arrivent en direct sur les
--     ecrans sans jamais devoiler le contenu des reponses)
-- ----------------------------------------------------------------------------

create or replace function bump_answered_count() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  update games
     set answered_count = answered_count + 1
   where id = new.game_id;
  return new;
end $fn$;

drop trigger if exists answers_bump_count on answers;
create trigger answers_bump_count
  after insert on answers
  for each row execute function bump_answered_count();

create or replace function refresh_player_count() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare gid uuid;
begin
  gid := coalesce(new.game_id, old.game_id);
  update games
     set player_count = (select count(*) from players
                          where game_id = gid and removed = false)
   where id = gid;
  return null;
end $fn$;

-- Deux declencheurs, et non un seul : c'est volontaire.
--
-- A la correction d'une question, le serveur reecrit la ligne de CHAQUE
-- apprenant pour y poser son nouveau score. Avec un declencheur unique sur
-- « update of removed », chacune de ces reecritures relancait un
-- « update games », car la colonne removed figure dans la liste des
-- colonnes ecrites meme quand sa valeur ne change pas.
--
-- Mesure sur une classe de 20 : 21 modifications de la ligne games pour
-- UNE correction, donc 21 messages temps reel vers chacun des 20
-- telephones. La clause « when » ci-dessous ramene cela a un seul.
drop trigger if exists players_refresh_count on players;
create trigger players_refresh_count
  after insert or delete on players
  for each row execute function refresh_player_count();

drop trigger if exists players_refresh_count_removed on players;
create trigger players_refresh_count_removed
  after update of removed on players
  for each row
  when (old.removed is distinct from new.removed)
  execute function refresh_player_count();

-- ----------------------------------------------------------------------------
--  7. SECURITE (RLS)
--
--  Regle d'or : RLS active partout, et SEULES DEUX politiques de lecture
--  existent (games et players). Les autres tables n'ont AUCUNE politique,
--  donc un navigateur ne peut ni les lire ni les ecrire.
--  Aucune ecriture n'est possible depuis un navigateur, nulle part : tout
--  passe par les routes API du serveur, qui utilisent la cle secrete.
-- ----------------------------------------------------------------------------

alter table quizzes        enable row level security;
alter table questions      enable row level security;
alter table games          enable row level security;
alter table players        enable row level security;
alter table player_secrets enable row level security;
alter table answers        enable row level security;

drop policy if exists "lecture publique des parties" on games;
create policy "lecture publique des parties"
  on games for select to anon, authenticated using (true);

drop policy if exists "lecture publique des joueurs" on players;
create policy "lecture publique des joueurs"
  on players for select to anon, authenticated using (true);

-- ----------------------------------------------------------------------------
--  8. Realtime : on ne diffuse QUE les deux tables publiques
-- ----------------------------------------------------------------------------

alter table games   replica identity full;
alter table players replica identity full;

do $pub$
begin
  alter publication supabase_realtime add table games;
exception when duplicate_object then null;
end $pub$;

do $pub$
begin
  alter publication supabase_realtime add table players;
exception when duplicate_object then null;
end $pub$;
