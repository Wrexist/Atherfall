-- Cloud saves change in order, whatever the players' device clocks say.
--
-- Every save carries a revision number that only the server sets: 1 when it is
-- created, +1 on every change. The game uploads through upload_save() "on top
-- of" the revision it last saw. If another device saved in between, the
-- upload is refused (it returns null) instead of silently overwriting that
-- progress; the game then stops syncing and lets the player choose on the
-- title screen. One device's uploads are sent one at a time, so they can't
-- overtake each other either.

alter table public.saves add column revision bigint not null default 0;

-- Server-owned: whatever a client sends, a new save starts at 1 and every
-- change adds 1 (direct table writes included).
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

-- Save on top of revision p_base (0 when this device has never seen a cloud
-- save). Returns the new revision, or null if the cloud save has moved on.
-- Runs as the caller, so the row-level security rules above still apply.
create function public.upload_save(
  p_data jsonb,
  p_version integer,
  p_level integer,
  p_saved_at timestamptz,
  p_base bigint
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  insert into public.saves as s (user_id, data, version, level, saved_at)
  values ((select auth.uid()), p_data, p_version, p_level, p_saved_at)
  on conflict (user_id) do update
    set data = excluded.data,
        version = excluded.version,
        level = excluded.level,
        saved_at = excluded.saved_at
    where s.revision = p_base
  returning s.revision;
$$;

revoke execute on function public.upload_save(jsonb, integer, integer, timestamptz, bigint) from public, anon;
grant execute on function public.upload_save(jsonb, integer, integer, timestamptz, bigint) to authenticated;
