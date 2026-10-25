-- =============================================================================
-- Admin overview: platform admins (profiles.is_admin) see stats and players
-- across every app, not only the apps they own.
--
--  * admin_overview(p_days): over the last p_days UTC days (1–365, today
--    included). Test builds are left out everywhere, as in app_analytics.
--      totals: apps (every apps row, official included), listedApps
--        (published), people (human profiles), newPeople (profiles created in
--        the window), activePlayers (humans seated in a match created in the
--        window or who opened a standalone app in it), matches (created in the
--        window), completed (ended in the window).
--      series: per day, matches (created), players (distinct humans seated in
--        matches created that day), newPeople (sign-ups). Missing days are zeros.
--      apps: every app (app_row_json) with matches/completed/players over the
--        window, roster (all-time: seated in a match or opened it signed in),
--        opens (all-time play_count) and lastActiveAt. Busiest first.
--  * admin_players(p_query, p_limit): every human profile with matches and
--    wins across all apps, standalone-app opens, how many apps they used,
--    joinedAt and lastSeenAt. Newest activity first (then newest sign-up);
--    p_query filters by handle or name; p_limit clamped to 1–1000 (default
--    500). Totals cover everyone: { total, newThisWeek, activeThisWeek, players }.
--    No emails: those stay per app, and only for players who share them
--    (app_players, which admins can already read for any app).
-- Both raise 42501 for anyone but an admin (require_admin). Mirrors the demo
-- backend (platform/demo/admin.ts). Safe to re-run.
-- =============================================================================

create or replace function public.admin_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_admin();
  v_days integer := coalesce(p_days, 30);
  v_today date := (now() at time zone 'utc')::date;
  v_from date;
  v_start timestamptz;
  result jsonb;
begin
  if v_days < 1 or v_days > 365 then
    raise exception 'Pick 1 to 365 days' using errcode = '22023';
  end if;
  v_from := v_today - (v_days - 1);
  v_start := v_from::timestamp at time zone 'utc';

  with m as (
    select x.id, x.app_slug, x.status, x.created_at, x.ended_at
      from public.matches x
     where x.version_id is null
  ),
  -- Humans who took a seat (bots, spectators, open invites and declines don't count).
  s as (
    select mp.user_id, m.app_slug, m.created_at
      from public.match_players mp
      join m on m.id = mp.match_id
     where mp.role = 'player' and not mp.is_bot and mp.state in ('joined', 'submitted', 'left')
  ),
  humans as (
    select p.id, p.created_at from public.profiles p where not p.is_bot
  ),
  days as (
    select d::date as day from generate_series(v_from::timestamp, v_today::timestamp, interval '1 day') d
  ),
  d_matches as (
    select (m.created_at at time zone 'utc')::date as day, count(*) as n from m where m.created_at >= v_start group by 1
  ),
  d_players as (
    select (s.created_at at time zone 'utc')::date as day, count(distinct s.user_id) as n from s where s.created_at >= v_start group by 1
  ),
  d_signups as (
    select (h.created_at at time zone 'utc')::date as day, count(*) as n from humans h where h.created_at >= v_start group by 1
  ),
  per_app as (
    select a as app_row, a.slug, a.play_count,
           (select count(*) from m where m.app_slug = a.slug and m.created_at >= v_start) as matches,
           (select count(*) from m where m.app_slug = a.slug and m.status = 'completed' and m.ended_at >= v_start) as completed,
           (select count(distinct s.user_id) from s where s.app_slug = a.slug and s.created_at >= v_start) as players,
           (select count(*) from (
              select s.user_id from s where s.app_slug = a.slug
              union
              select x.user_id from public.app_audience x where x.app_slug = a.slug and x.opens > 0
            ) r) as roster,
           greatest(
             (select max(m.created_at) from m where m.app_slug = a.slug),
             (select max(x.last_opened_at) from public.app_audience x where x.app_slug = a.slug)
           ) as last_active
      from public.apps a
  )
  select jsonb_build_object(
    'days', v_days,
    'totals', jsonb_build_object(
      'apps', (select count(*) from public.apps),
      'listedApps', (select count(*) from public.apps a where a.status = 'published'),
      'people', (select count(*) from humans),
      'newPeople', (select count(*) from humans h where h.created_at >= v_start),
      'activePlayers', (
        select count(*) from (
          select s.user_id from s where s.created_at >= v_start
          union
          select x.user_id from public.app_audience x
            join humans h on h.id = x.user_id
           where x.last_opened_at >= v_start
        ) r
      ),
      'matches', (select count(*) from m where m.created_at >= v_start),
      'completed', (select count(*) from m where m.status = 'completed' and m.ended_at >= v_start)
    ),
    'series', (
      select jsonb_agg(jsonb_build_object(
               'date', to_char(d.day, 'YYYY-MM-DD'),
               'matches', coalesce(dm.n, 0), 'players', coalesce(dp.n, 0), 'newPeople', coalesce(ds.n, 0)
             ) order by d.day)
        from days d
        left join d_matches dm on dm.day = d.day
        left join d_players dp on dp.day = d.day
        left join d_signups ds on ds.day = d.day
    ),
    'apps', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'app', public.app_row_json(x.app_row), 'matches', x.matches, 'completed', x.completed, 'players', x.players,
               'roster', x.roster, 'opens', x.play_count, 'lastActiveAt', x.last_active
             ) order by x.matches desc, x.players desc, x.roster desc, x.last_active desc nulls last, x.slug), '[]'::jsonb)
        from per_app x
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_players(p_query text default null, p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_admin();
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 1000));
  v_query text := nullif(lower(btrim(coalesce(p_query, ''), ' @')), '');
  result jsonb;
begin
  with seats as (
    select mp.user_id, mp.result, m.app_slug, m.created_at
      from public.match_players mp
      join public.matches m on m.id = mp.match_id
     where m.version_id is null
       and mp.role = 'player' and not mp.is_bot and mp.state in ('joined', 'submitted', 'left')
  ),
  used as (
    select s.user_id, s.app_slug from seats s
    union
    select x.user_id, x.app_slug from public.app_audience x where x.opens > 0
  ),
  played as (
    select s.user_id, count(*) as matches, count(*) filter (where s.result = 'win') as wins, max(s.created_at) as last_at
      from seats s group by s.user_id
  ),
  opened as (
    select x.user_id, sum(x.opens) as opens, max(x.last_opened_at) as last_at
      from public.app_audience x group by x.user_id
  ),
  people as (
    select p as prof, p.handle, p.name, p.created_at,
           coalesce(pl.matches, 0) as matches, coalesce(pl.wins, 0) as wins, coalesce(o.opens, 0) as opens,
           (select count(*) from used u where u.user_id = p.id) as apps,
           greatest(pl.last_at, o.last_at) as last_seen
      from public.profiles p
      left join played pl on pl.user_id = p.id
      left join opened o on o.user_id = p.id
     where not p.is_bot
  ),
  page as (
    select * from people x
     where v_query is null or x.handle like '%' || v_query || '%' or lower(x.name) like '%' || v_query || '%'
     order by x.last_seen desc nulls last, x.created_at desc, x.handle
     limit v_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from people),
    'newThisWeek', (select count(*) from people x where x.created_at >= now() - interval '7 days'),
    'activeThisWeek', (select count(*) from people x where x.last_seen >= now() - interval '7 days'),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'profile', public.profile_json(x.prof), 'matches', x.matches, 'wins', x.wins, 'opens', x.opens,
               'apps', x.apps, 'joinedAt', x.created_at, 'lastSeenAt', x.last_seen
             ) order by x.last_seen desc nulls last, x.created_at desc, x.handle), '[]'::jsonb)
        from page x
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function public.admin_overview(integer) from public, anon;
grant execute on function public.admin_overview(integer) to authenticated;
revoke execute on function public.admin_players(text, integer) from public, anon;
grant execute on function public.admin_players(text, integer) to authenticated;
