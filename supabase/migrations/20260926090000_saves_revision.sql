-- Cloud saves change in order, whatever the players' device clocks say.
--
-- Every save carries a revision number that only the server sets: 1 when it is
-- created, +1 on every change. The game uploads through upload_save() "on top
-- of" the revision it last saw. If another device saved in between, the
-- upload is refused (it returns null) instead of silently overwriting that
-- progress; the game then stops syncing and lets the player choose on the
-- title screen. One device's uploads are sent one at a time, so they can't
-- overtake each other either.
--
-- upload_save() is the ONLY way to write a save: direct inserts and updates
-- (an old game version's upsert, or any hand-made request) would skip the
-- revision check, so players can no longer write the table directly.

alter table public.saves add column revision bigint not null default 0;

-- Server-owned: whatever a write sends, a new save starts at 1 and every
-- change adds 1.
create function public.saves_bump_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

create trigger saves_revision before insert or update on public.saves
  for each row execute function public.saves_bump_revision();

-- Reading and deleting your own save stay as they were; writing goes through
-- upload_save() only.
drop policy "Players create their own save" on public.saves;
drop policy "Players update their own save" on public.saves;
revoke insert, update on public.saves from anon, authenticated;

-- Save on top of revision p_base (0 when this device has never seen a cloud
-- save). Returns the new revision, or null if the cloud save has moved on.
-- Runs with the table owner's rights (players can't write the table
-- themselves), so it only ever touches the caller's own row.
create function public.upload_save(
  p_data jsonb,
  p_version integer,
  p_level integer,
  p_saved_at timestamptz,
  p_base bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rev bigint;
begin
  if uid is null then
    raise exception 'sign in to save to the cloud' using errcode = '42501';
  end if;
  insert into public.saves as s (user_id, data, version, level, saved_at)
  values (uid, p_data, p_version, p_level, p_saved_at)
  on conflict (user_id) do update
    set data = excluded.data,
        version = excluded.version,
        level = excluded.level,
        saved_at = excluded.saved_at
    where s.revision = p_base
  returning s.revision into rev;
  return rev;
end;
$$;

revoke execute on function public.upload_save(jsonb, integer, integer, timestamptz, bigint) from public, anon;
grant execute on function public.upload_save(jsonb, integer, integer, timestamptz, bigint) to authenticated;
