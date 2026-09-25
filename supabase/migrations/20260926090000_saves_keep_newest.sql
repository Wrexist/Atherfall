-- A cloud save only moves forward in time. An upload older than the stored save
-- (a second device still signed in, or a request delayed on a bad network) is
-- skipped instead of overwriting newer progress. The game re-stamps a device
-- save the player explicitly chose to keep, so that choice still goes through.

create function public.saves_keep_newest()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.saved_at < old.saved_at then
    return null; -- leave the newer stored save untouched
  end if;
  return new;
end;
$$;

create trigger saves_keep_newest before update on public.saves
  for each row execute function public.saves_keep_newest();
