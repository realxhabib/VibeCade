-- =============================================================================
-- One live game at a time.
--
-- A player could start a live (or practice) match while another one was still
-- running in a different tab, and both kept going: the old room stayed open on
-- the live server and the opponent waited out the forfeit timers.
--
-- Now, when a player starts playing a live or practice match (mark_started,
-- which the play room calls each time a seated player's game begins), they
-- leave every other running live or practice match they're still in:
--
--  * live: they're marked left, exactly as forfeit_match / end_abandoned_matches
--    would, the turn moves on, and maybe_settle settles the match when too few
--    remain (a 1v1 opponent wins by forfeit);
--  * practice (only bots to keep company): cancelled.
--
-- Async matches (days-long turns) and lobbies that haven't started are left
-- alone; entering one of those later ends this one instead. A player who has
-- already submitted is done playing and stays in. Mirrors leaveOtherMatches in
-- the demo backend. Safe to re-run.
-- =============================================================================

-- Returns how many matches p_user left.
create or replace function public.leave_other_matches(p_user uuid, p_keep uuid)
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
    select x.id, x.mode, x.turn_user from public.matches x
      join public.match_players mp on mp.match_id = x.id and mp.user_id = p_user
     where x.id <> p_keep and x.status = 'active' and x.mode in ('live', 'practice')
       and mp.role = 'player' and mp.state = 'joined'
     order by x.created_at
     for update of x
  loop
    if r.mode = 'practice' then
      update public.matches set status = 'cancelled', updated_at = now() where id = r.id;
    else
      update public.match_players set state = 'left' where match_id = r.id and user_id = p_user;
      if r.turn_user = p_user then
        update public.matches set turn_user = public.next_turn_user(r.id, p_user) where id = r.id;
      end if;
      if not public.maybe_settle(r.id) then
        update public.matches set updated_at = now() where id = r.id;
      end if;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.leave_other_matches(uuid, uuid) from public, anon, authenticated;

-- As in 20260930000000_general_matches, plus starting a live or practice match
-- ends my other ones.
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
  end if;
end;
$$;
