-- =============================================================================
-- Abandoned live and practice matches end on their own.
--
-- Nothing ended a running live match nobody played any more: claim_forfeit
-- needs the remaining player to press it, and the 2-hour expiry in
-- 20261007000000_stop_write_loops was a one-off UPDATE. Such matches stayed
-- "active" for good, and so did anything tied to them (a tab retrying a write
-- to one looped for hours on 2026-10-15).
--
--  * Last player standing (live): once a single human player is still
--    connected (heartbeat within 2 minutes) and the others have gone quiet,
--    the quiet ones are marked left, exactly as claim_forfeit would (45 s),
--    and maybe_settle settles the match: the one left wins by forfeit. Bots
--    still in keep the match going.
--  * Live and practice matches nobody has written to for 30 minutes expire.
--    Async matches wait on turn deadlines (expire_turn) and never expire here.
--
-- Liveness is match_players.last_seen_at, from the heartbeat RPC the play room
-- calls every 10 s for live matches, whatever carries the room (Supabase
-- Realtime or the live server): a player connected to the room but unable to
-- reach Supabase for 2 minutes counts as gone.
--
-- Runs every minute when pg_cron is available, and for a player's own matches
-- when they list them. Mirrors endAbandonedMatches in the demo backend.
-- Safe to re-run.
-- =============================================================================

-- p_user: only that player's matches (null: everyone's). Returns how many ended or changed.
create or replace function public.end_abandoned_matches(p_user uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grace constant interval := interval '2 minutes';
  r record;
  m public.matches;
  n integer := 0;
  v_expired integer;
begin
  for r in
    select x.id from public.matches x
     where x.status = 'active' and x.mode = 'live' and x.started_at is not null
       and (p_user is null or exists (select 1 from public.match_players mp where mp.match_id = x.id and mp.user_id = p_user))
       and (select count(*) from public.match_players mp
             where mp.match_id = x.id and mp.role = 'player' and not mp.is_bot and mp.state in ('joined', 'submitted')
               and coalesce(mp.last_seen_at, x.started_at) > now() - v_grace) = 1
       and exists (select 1 from public.match_players mp
                    where mp.match_id = x.id and mp.role = 'player' and not mp.is_bot and mp.state = 'joined'
                      and coalesce(mp.last_seen_at, x.started_at) <= now() - v_grace)
     order by x.updated_at
     limit 200
     for update of x skip locked
  loop
    select * into m from public.matches where id = r.id;
    update public.match_players set state = 'left'
     where match_id = r.id and role = 'player' and not is_bot and state = 'joined'
       and coalesce(last_seen_at, m.started_at) <= now() - v_grace;
    if m.turn_user is not null and exists (
         select 1 from public.match_players where match_id = r.id and user_id = m.turn_user and state = 'left') then
      update public.matches set turn_user = public.next_turn_user(r.id, m.turn_user) where id = r.id;
    end if;
    if not public.maybe_settle(r.id) then
      update public.matches set updated_at = now() where id = r.id;
    end if;
    n := n + 1;
  end loop;

  -- Activity is matches.updated_at, which any write to the match bumps (update_match_state,
  -- submit_entry, turns, rounds...); nothing here assumes live state goes through
  -- update_match_state. If a writer holds a live lease instead (e.g. a live-server room that
  -- checkpoints its state), count it here: `and not (x.state_lease_until > now())`.
  update public.matches x
     set status = 'expired', updated_at = now()
   where x.status = 'active' and x.mode in ('live', 'practice')
     and x.updated_at < now() - interval '30 minutes'
     and (p_user is null or exists (select 1 from public.match_players mp where mp.match_id = x.id and mp.user_id = p_user));
  get diagnostics v_expired = row_count;
  return n + v_expired;
end;
$$;

revoke execute on function public.end_abandoned_matches(uuid) from public, anon, authenticated;

-- As in 20261006000000_lobby_expiry, plus my abandoned matches end first.
create or replace function public.list_my_matches()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  result jsonb;
begin
  if v_me is null then
    return '[]'::jsonb;
  end if;
  perform public.expire_idle_lobbies(v_me);
  perform public.end_abandoned_matches(v_me);
  perform public.expire_turn(m.id)
     from public.matches m
    where m.status = 'active' and m.turn_deadline < now()
      and exists (select 1 from public.match_players mp where mp.match_id = m.id and mp.user_id = v_me)
    limit 20;
  select coalesce(jsonb_agg(public.match_json(m, v_me) order by m.updated_at desc), '[]'::jsonb) into result
    from (
      select m.* from public.matches m
       where exists (select 1 from public.match_players mp
                      where mp.match_id = m.id and mp.user_id = v_me and mp.role = 'player')
       order by m.updated_at desc
       limit 60
    ) m;
  return result;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'cron' and p.proname = 'schedule') then
    raise notice 'pg_cron is not available: abandoned matches end when players load their matches';
    return;
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'cron' and c.relname = 'job') then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = ''xapps-abandoned''';
  end if;
  execute $cmd$select cron.schedule('xapps-abandoned', '* * * * *', 'select public.end_abandoned_matches()')$cmd$;
end $$;
