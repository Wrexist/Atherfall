-- Invites waiting for the caller, with the inviter's name and the time left by
-- the server's clock. The game shouldn't judge expiry itself: a phone's clock
-- can be minutes off, which would hide live invites or show dead ones.
create function public.my_party_invites()
returns table (id uuid, from_name text, seconds_left double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id, p.display_name, extract(epoch from i.expires_at - now())::double precision
  from public.party_invites i
  left join public.profiles p on p.id = i.from_user
  where i.to_user = (select auth.uid()) and not i.declined and i.expires_at > now()
  order by i.created_at;
$$;

revoke execute on function public.my_party_invites() from public, anon;
grant execute on function public.my_party_invites() to authenticated;
