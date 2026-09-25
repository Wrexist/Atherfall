-- Parties (see docs/PARTIES.md): up to 4 players, invites to nearby players,
-- a private live channel per party. Who is in which party lives here, and
-- only the functions below change it, always acting as the signed-in caller.
-- (Presence messages carry client-chosen ids, so they can't be trusted for this.)

-- Players choose whether they take invites (the game shows it as a setting).
alter table public.profiles add column party_invites boolean not null default true;

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  leader uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One party at a time: a player appears here at most once.
create table public.party_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  party_id uuid not null references public.parties (id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index party_members_party on public.party_members (party_id);

create table public.party_invites (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties (id) on delete cascade,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 minutes',
  -- Kept (not deleted) when declined, so the rate limit and the "they said
  -- no" cooldown can't be dodged by re-inviting.
  declined boolean not null default false,
  constraint party_invites_not_self check (from_user <> to_user)
);
create index party_invites_to on public.party_invites (to_user);
create index party_invites_from on public.party_invites (from_user, created_at);

alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.party_invites enable row level security;

-- The caller's party (null if none). Security definer so policies can use it
-- without recursing into party_members' own policy.
create function public.my_party()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select party_id from public.party_members where user_id = (select auth.uid());
$$;

create policy "Members see their party"
  on public.parties for select to authenticated
  using (id = (select public.my_party()));

create policy "Members see their party's members"
  on public.party_members for select to authenticated
  using (party_id = (select public.my_party()));

create policy "Inviter and invitee see an invite"
  on public.party_invites for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));

-- No direct writes: every change goes through the functions below.
revoke insert, update, delete on public.parties, public.party_members, public.party_invites
  from anon, authenticated;

-- ─── Functions ───────────────────────────────────────────────────────────────

-- Invite a player to your party (one is made, with you leading, if you have
-- none). Returns the invite id.
create function public.invite_to_party(p_to uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  pid uuid;
  members integer;
  recent integer;
  invite uuid;
begin
  if me is null then
    raise exception 'Sign in to invite players.' using errcode = '42501';
  end if;
  if p_to = me then
    raise exception 'You can''t invite yourself.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_to and party_invites) then
    raise exception 'That player isn''t taking party invites.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.party_members where user_id = p_to) then
    raise exception 'That player is already in a party.' using errcode = 'P0001';
  end if;
  -- Housekeeping: old invites have done their job (rate limit, cooldown).
  delete from public.party_invites where expires_at < now() - interval '10 minutes';
  select count(*) into recent
    from public.party_invites
    where from_user = me and created_at > now() - interval '1 minute';
  if recent >= 5 then
    raise exception 'Too many invites. Wait a moment.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.party_invites
    where from_user = me and to_user = p_to and declined and created_at > now() - interval '1 minute'
  ) then
    raise exception 'They said no. Try again later.' using errcode = 'P0001';
  end if;

  select party_id into pid from public.party_members where user_id = me;
  if pid is null then
    insert into public.parties (leader) values (me) returning id into pid;
    insert into public.party_members (user_id, party_id) values (me, pid);
  end if;
  perform 1 from public.parties where id = pid for update; -- one join at a time
  select count(*) into members from public.party_members where party_id = pid;
  if members >= 4 then
    raise exception 'Your party is full.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.party_invites
    where party_id = pid and to_user = p_to and not declined and expires_at > now()
  ) then
    raise exception 'Already invited.' using errcode = 'P0001';
  end if;
  insert into public.party_invites (party_id, from_user, to_user)
    values (pid, me, p_to) returning id into invite;
  return invite;
end;
$$;

-- Join the party an invite is for. Returns the party id.
create function public.accept_invite(p_invite uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inv public.party_invites;
  members integer;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into inv from public.party_invites where id = p_invite and to_user = me and not declined;
  if not found then
    raise exception 'That invite is gone.' using errcode = 'P0001';
  end if;
  if inv.expires_at < now() then
    delete from public.party_invites where id = p_invite;
    raise exception 'That invite has expired.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.party_members where user_id = me) then
    raise exception 'Leave your party first.' using errcode = 'P0001';
  end if;
  perform 1 from public.parties where id = inv.party_id for update;
  if not found then
    raise exception 'That party has broken up.' using errcode = 'P0001';
  end if;
  select count(*) into members from public.party_members where party_id = inv.party_id;
  if members >= 4 then
    raise exception 'That party is full.' using errcode = 'P0001';
  end if;
  insert into public.party_members (user_id, party_id) values (me, inv.party_id);
  delete from public.party_invites where to_user = me;
  return inv.party_id;
end;
$$;

create function public.decline_invite(p_invite uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.party_invites set declined = true
    where id = p_invite and to_user = (select auth.uid());
$$;

-- Leave your party. The longest-standing member takes over as leader; an
-- empty party is removed.
create function public.leave_party()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  pid uuid;
begin
  select party_id into pid from public.party_members where user_id = me;
  if pid is null then
    return;
  end if;
  perform 1 from public.parties where id = pid for update;
  delete from public.party_members where user_id = me;
  if not exists (select 1 from public.party_members where party_id = pid) then
    delete from public.parties where id = pid;
  elsif (select leader from public.parties where id = pid) = me then
    update public.parties
      set leader = (select user_id from public.party_members where party_id = pid order by joined_at limit 1)
      where id = pid;
  end if;
end;
$$;

-- The leader removes a member.
create function public.remove_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  pid uuid;
begin
  select id into pid from public.parties where leader = me;
  if pid is null then
    raise exception 'Only the party leader can do that.' using errcode = '42501';
  end if;
  if p_user = me then
    raise exception 'Leave the party instead.' using errcode = '22023';
  end if;
  delete from public.party_members where user_id = p_user and party_id = pid;
end;
$$;

revoke execute on function public.invite_to_party(uuid), public.accept_invite(uuid),
  public.decline_invite(uuid), public.leave_party(), public.remove_member(uuid), public.my_party()
  from public, anon;
grant execute on function public.invite_to_party(uuid), public.accept_invite(uuid),
  public.decline_invite(uuid), public.leave_party(), public.remove_member(uuid), public.my_party()
  to authenticated;

-- ─── Live channel ────────────────────────────────────────────────────────────
-- Party health and kills travel on "party:<party id>", open to its members only.
create policy "Party members receive party updates"
  on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'party:' || (select public.my_party())::text);

create policy "Party members send party updates"
  on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'party:' || (select public.my_party())::text);

-- Invites and member changes reach players instantly (row security still applies).
alter publication supabase_realtime add table public.party_invites, public.party_members;
