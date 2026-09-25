-- Aetherfall online foundation: player profiles, cloud saves, and who may use
-- the live world channels. Safe to run on a fresh Lovable Cloud / Supabase project.

-- ─── Profiles ────────────────────────────────────────────────────────────────
-- One row per account, created automatically at sign-up. Public to read (other
-- players see your name, class and level), writable only by its owner.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  archetype text not null default 'vanguard',
  level integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_format
    check (display_name ~ '^[A-Za-z0-9][A-Za-z0-9 _-]{1,14}[A-Za-z0-9]$'),
  constraint profiles_archetype_known check (archetype in ('vanguard', 'ranger', 'arcanist')),
  constraint profiles_level_range check (level between 1 and 99)
);

-- Names are unique regardless of case ("Sela" and "sela" can't both exist).
create unique index profiles_display_name_unique on public.profiles (lower(display_name));

alter table public.profiles enable row level security;

create policy "Profiles are visible to everyone"
  on public.profiles for select
  using (true);

create policy "Players update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ─── Cloud saves ─────────────────────────────────────────────────────────────
-- The same versioned save the game keeps on the device, one per account.
create table public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  version integer not null,
  level integer not null default 1,
  saved_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint saves_data_size check (pg_column_size(data) < 262144),
  constraint saves_data_object check (jsonb_typeof(data) = 'object')
);

alter table public.saves enable row level security;

create policy "Players read their own save"
  on public.saves for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Players create their own save"
  on public.saves for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Players update their own save"
  on public.saves for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Players delete their own save"
  on public.saves for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ─── Housekeeping ────────────────────────────────────────────────────────────
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger saves_touch before update on public.saves
  for each row execute function public.touch_updated_at();

-- Create the profile at sign-up from the name the player chose. If that name is
-- taken or invalid (the game checks first, so this is a race), fall back to a
-- generated "Wanderer…" name the player can change later.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
begin
  begin
    insert into public.profiles (id, display_name)
    values (new.id, coalesce(wanted, 'Wanderer' || substr(replace(new.id::text, '-', ''), 1, 8)));
  exception when unique_violation or check_violation then
    insert into public.profiles (id, display_name)
    values (new.id, 'Wanderer' || substr(replace(new.id::text, '-', ''), 1, 8));
  end;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Live world channels ─────────────────────────────────────────────────────
-- Players' positions travel over private Realtime channels named "world:…".
-- Only signed-in players may join them (no anonymous spam into the world).
create policy "Signed-in players receive world updates"
  on realtime.messages for select
  to authenticated
  using ((select realtime.topic()) like 'world:%');

create policy "Signed-in players send world updates"
  on realtime.messages for insert
  to authenticated
  with check ((select realtime.topic()) like 'world:%');
