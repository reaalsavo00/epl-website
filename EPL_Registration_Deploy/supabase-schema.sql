-- Run this entire script in Supabase Dashboard > SQL Editor > New query.
create extension if not exists pgcrypto;

create table if not exists public.epl_team_registrations (
  id uuid primary key default gen_random_uuid(),
  team_name text not null check (char_length(team_name) between 2 and 60),
  short_code text not null check (char_length(short_code) between 2 and 4),
  region text not null check (char_length(region) between 2 and 60),
  captain_name text not null check (char_length(captain_name) between 2 and 60),
  captain_discord text not null check (char_length(captain_discord) between 2 and 80),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index if not exists epl_team_code_unique on public.epl_team_registrations (lower(short_code));

create table if not exists public.epl_player_registrations (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 60),
  roblox_username text not null check (char_length(roblox_username) between 3 and 40),
  discord_username text not null check (char_length(discord_username) between 2 and 80),
  team_name text,
  position text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists epl_team_status_created on public.epl_team_registrations (status, created_at desc);
create index if not exists epl_player_status_created on public.epl_player_registrations (status, created_at desc);

-- All website access goes through the Netlify Function. Never expose the service-role key in browser code.
alter table public.epl_team_registrations enable row level security;
alter table public.epl_player_registrations enable row level security;
revoke all on table public.epl_team_registrations from anon, authenticated;
revoke all on table public.epl_player_registrations from anon, authenticated;
