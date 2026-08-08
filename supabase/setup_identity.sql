-- Kubb Platform — Phase 1 (W5): Identity & profiles
-- Run once in the Supabase SQL editor. Idempotent where practical.
-- Ports the IDENTITY subset of design_handoff_kubb_platform_spike/schema.sql
-- + the handle_new_user trigger from functions.sql, plus a backfill for
-- accounts created before the trigger existed.

create extension if not exists citext;

-- ============ TABLES ============

-- 1:1 with auth.users; created by trigger below.
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  handle       citext unique not null,          -- citext: Erik == erik
  display_name text not null,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- A PERSON (managed or real). Every account gets one; organizers will later
-- create user_id-NULL rows for managed players (W7).
create table if not exists players (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references auth.users(id) on delete set null,
  display_name text not null,
  created_by   uuid references auth.users(id),
  claimed_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- Claim tokens live in their OWN table with NO select policy:
-- a leaked token = identity theft. Only claim RPCs (W7) touch it.
create table if not exists player_claims (
  player_id   uuid primary key references players(id) on delete cascade,
  claim_token uuid unique not null default gen_random_uuid(),
  expires_at  timestamptz not null default now() + interval '30 days'
);

create table if not exists teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists team_members (
  team_id   uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

-- ============ SIGNUP TRIGGER ============

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_handle citext;
begin
  v_handle := coalesce(new.raw_user_meta_data->>'handle',
                       split_part(new.email, '@', 1) || '-' || left(new.id::text, 4));
  insert into profiles (id, handle, display_name)
  values (new.id, v_handle, coalesce(new.raw_user_meta_data->>'display_name', v_handle))
  on conflict (id) do nothing;

  insert into players (user_id, display_name, created_by, claimed_at)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', v_handle), new.id, now())
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ============ BACKFILL (existing accounts predating the trigger) ============

insert into profiles (id, handle, display_name)
select u.id,
       split_part(u.email, '@', 1) || '-' || left(u.id::text, 4),
       split_part(u.email, '@', 1)
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id)
on conflict do nothing;

insert into players (user_id, display_name, created_by, claimed_at)
select u.id,
       coalesce((select display_name from profiles where id = u.id),
                split_part(u.email, '@', 1)),
       u.id, now()
from auth.users u
where not exists (select 1 from players pl where pl.user_id = u.id)
on conflict (user_id) do nothing;

-- ============ ROW LEVEL SECURITY ============

alter table profiles      enable row level security;
alter table players       enable row level security;
alter table player_claims enable row level security;  -- no policies → nobody reads it
alter table teams         enable row level security;
alter table team_members  enable row level security;

-- profiles: public read, own update (insert is trigger-only via SECURITY DEFINER)
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (true);
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- players: public read (rosters/leaderboards); ALL writes via RPCs (W7)
drop policy if exists players_select on players;
create policy players_select on players for select to authenticated using (true);

-- teams: public read; owner manages
drop policy if exists teams_select on teams;
create policy teams_select on teams for select to authenticated using (true);
drop policy if exists teams_insert on teams;
create policy teams_insert on teams for insert to authenticated with check (created_by = auth.uid());
drop policy if exists teams_update on teams;
create policy teams_update on teams for update to authenticated using (created_by = auth.uid());
drop policy if exists team_members_select on team_members;
create policy team_members_select on team_members for select to authenticated using (true);
drop policy if exists team_members_write on team_members;
create policy team_members_write on team_members for all to authenticated
  using (exists (select 1 from teams t where t.id = team_id and t.created_by = auth.uid()))
  with check (exists (select 1 from teams t where t.id = team_id and t.created_by = auth.uid()));
