-- =============================================================================
-- Start without the no-shows.
--
-- A live match only started once every seated player's game said it was ready,
-- so one player who accepted and never opened the match (or whose tab never got
-- there) held everyone else, and their live-server room, on the waiting screen
-- until the match expired.
--
-- Now the waiting screen counts down (15 s, retrying the ready handshake along
-- the way), and when it runs out a player who is there calls drop_no_shows with
-- the players whose game still isn't ready. They're taken out of contention, not
-- forfeited: their seat is marked declined, which place_players and the scoring
-- in src/platform/scoring.ts leave out (no loss, no XP), and the match starts
-- with whoever is in. When that leaves too few players (a 1v1, or an empty
-- team) the match is cancelled instead: nobody played, so nobody wins.
--
-- Only before the match starts (started_at is null), only once every human has
-- had 15 s since joining, and never the caller. Mirrors dropNoShows in the demo
-- backend. Safe to re-run.
-- =============================================================================

create or replace function public.drop_no_shows(p_match uuid, p_users uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_user();
  m public.matches;
  v_full_since timestamptz;
  v_alive integer;
  v_humans integer;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or m.status <> 'active' or m.mode <> 'live' or m.started_at is not null then
    raise exception 'Match isn''t waiting to start' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.match_players
     where match_id = p_match and user_id = v_me and role = 'player' and state = 'joined'
  ) then
    raise exception 'Not your match' using errcode = '42501';
  end if;
  select max(joined_at) into v_full_since from public.match_players
   where match_id = p_match and role = 'player' and not is_bot and state = 'joined';
  if v_full_since > now() - interval '15 seconds' then
    raise exception 'Give them a little longer' using errcode = '55000';
  end if;

  update public.match_players set state = 'declined'
   where match_id = p_match and role = 'player' and not is_bot and state = 'joined'
     and user_id <> v_me and user_id = any(coalesce(p_users, '{}'::uuid[]));
  if not found then
    return;
  end if;

  if m.turn_user is not null and exists (
       select 1 from public.match_players where match_id = p_match and user_id = m.turn_user and state = 'declined') then
    update public.matches set turn_user = public.next_turn_user(p_match, m.turn_user) where id = p_match;
  end if;

  select count(*) filter (where state in ('invited', 'joined', 'submitted')),
         count(*) filter (where state in ('invited', 'joined', 'submitted') and not is_bot)
    into v_alive, v_humans
    from public.match_players where match_id = p_match and role = 'player';
  if v_alive < 2 or v_humans = 0
     or (m.team_count > 0 and exists (
           select 1 from generate_series(0, m.team_count - 1) g(t)
            where not exists (
              select 1 from public.match_players mp
               where mp.match_id = p_match and mp.role = 'player' and mp.team = g.t
                 and mp.state in ('invited', 'joined', 'submitted')))) then
    update public.matches set status = 'cancelled', updated_at = now() where id = p_match;
  else
    update public.matches set updated_at = now() where id = p_match;
  end if;
end;
$$;
