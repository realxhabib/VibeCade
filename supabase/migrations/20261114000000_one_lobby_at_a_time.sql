-- =============================================================================
-- One lobby at a time.
--
-- A player could sit in several lobbies at once (a quick match in one game, an
-- invite link in another, "Join" from the online list...), so hosts pressed
-- Start with someone who had long moved on.
--
-- Now, whenever a player takes a seat in a lobby (a live or sandbox match that
-- hasn't started: status 'open' or 'pending'), they leave every other lobby
-- they're sitting in. That covers creating a challenge, a rematch, quick match,
-- joining from a link or the online list, and accepting an invite, because all
-- of them end in a match_players row going to 'joined'; a trigger catches them
-- all. Starting to play a live or practice match (mark_started) leaves your
-- lobbies too.
--
-- Leaving a lobby:
--  * your own (you're the host): it's cancelled, as if you'd pressed Cancel;
--  * someone else's: your seat frees up, as when a multiplayer invite is
--    declined; a private challenge that's now short of players is declined.
--
-- Async challenges (days-long turns) aren't lobbies and are left alone.
-- Mirrors leaveOtherLobbies in the demo backend. Safe to re-run.
-- =============================================================================

-- Returns how many lobbies p_user left.
create or replace function public.leave_other_lobbies(p_user uuid, p_keep uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select x.id, x.status, x.is_open, x.min_players, x.created_by from public.matches x
      join public.match_players mp on mp.match_id = x.id and mp.user_id = p_user
     where x.id <> p_keep and x.status in ('open', 'pending') and x.mode not in ('async', 'practice')
       and mp.role = 'player' and mp.state = 'joined'
     order by x.created_at
     -- Skip a lobby someone else is changing right now rather than risk a deadlock.
     for update of x skip locked
  loop
    if r.created_by = p_user then
      update public.matches set status = 'cancelled', updated_at = now() where id = r.id;
    else
      delete from public.match_players where match_id = r.id and user_id = p_user;
      if not r.is_open
         and (select count(*) from public.match_players where match_id = r.id and role = 'player') < r.min_players then
        update public.matches set status = 'declined', updated_at = now() where id = r.id;
      else
        update public.matches set updated_at = now() where id = r.id;
      end if;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.leave_other_lobbies(uuid, uuid) from public, anon, authenticated;

-- Taking a seat in a lobby leaves the others.
create or replace function public.match_players_one_lobby()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'player' and new.state = 'joined'
     and (tg_op = 'INSERT' or old.state is distinct from 'joined' or old.role is distinct from 'player')
     and exists (select 1 from public.matches m
                  where m.id = new.match_id and m.status in ('open', 'pending')
                    and m.mode not in ('async', 'practice')) then
    perform public.leave_other_lobbies(new.user_id, new.match_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.match_players_one_lobby() from public, anon, authenticated;

drop trigger if exists match_players_one_lobby on public.match_players;
create trigger match_players_one_lobby
  after insert or update of state, role on public.match_players
  for each row execute function public.match_players_one_lobby();

-- As in 20261023000100_one_match_at_a_time, plus starting a live or practice
-- match leaves my lobbies.
create or replace function public.mark_started(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_user();
begin
  if not exists (select 1 from public.match_players where match_id = p_match and user_id = v_me and role = 'player') then
    raise exception 'Not your match' using errcode = '42501';
  end if;
  update public.matches set started_at = coalesce(started_at, now())
   where id = p_match and started_at is null;
  if exists (select 1 from public.matches m
               join public.match_players mp on mp.match_id = m.id and mp.user_id = v_me
              where m.id = p_match and m.status = 'active' and m.mode in ('live', 'practice')
                and mp.state = 'joined') then
    perform public.leave_other_matches(v_me, p_match);
    perform public.leave_other_lobbies(v_me, p_match);
  end if;
end;
$$;
