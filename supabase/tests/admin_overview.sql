-- Admin overview (20261024000100_admin_overview.sql). Runs after app_audience.sql, on its users
-- (Rita is an admin from lifecycle.sql; Bob owns crm-live, which Carol and Erin opened).
\set ON_ERROR_STOP on
\set QUIET on

create function pg_temp.login(p_handle text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where handle = p_handle), ''), false);
$$;
create function pg_temp.expect(p_sql text, p_state text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected %', p_state;
exception when others then
  assert sqlstate = p_state, format('%s -> %s %s (expected %s)', p_sql, sqlstate, sqlerrm, p_state);
end $$;
grant execute on function pg_temp.login(text), pg_temp.expect(text, text) to anon, authenticated;

-- Admins only: not the app's owner, not signed out.
set role authenticated;
select pg_temp.login('bob');
select pg_temp.expect($q$select public.admin_overview()$q$, '42501');
select pg_temp.expect($q$select public.admin_players()$q$, '42501');
set role anon;
select pg_temp.login('nobody');
select pg_temp.expect($q$select public.admin_overview()$q$, '42501');
select pg_temp.expect($q$select public.admin_players()$q$, '42501');

set role authenticated;
select pg_temp.login('rita');
select pg_temp.expect($q$select public.admin_overview(0)$q$, '22023');
select pg_temp.expect($q$select public.admin_overview(366)$q$, '22023');

-- Still signed in as Rita; the expected counts read the tables without RLS.
reset role;

do $$
declare
  r jsonb;
  crm jsonb;
  humans int := (select count(*) from public.profiles where not is_bot);
begin
  r := public.admin_overview(7);
  assert (r->>'days')::int = 7 and jsonb_array_length(r->'series') = 7, r::text;
  assert (r->'totals'->>'apps')::int = (select count(*) from public.apps), 'every app: ' || (r->'totals')::text;
  assert (r->'totals'->>'listedApps')::int = (select count(*) from public.apps where status = 'published'), (r->'totals')::text;
  assert (r->'totals'->>'people')::int = humans, 'humans only: ' || (r->'totals')::text;
  assert jsonb_array_length(r->'apps') = (select count(*) from public.apps), 'apps listed, not only rita''s';
  -- Bob's unlisted app is there too.
  assert exists (select 1 from jsonb_array_elements(r->'apps') x where x->'app'->>'slug' = 'crm-review' and x->'app'->>'status' = 'pending'), 'unlisted apps';
  crm := (select x from jsonb_array_elements(r->'apps') x where x->'app'->>'slug' = 'crm-live');
  assert (crm->>'roster')::int = 2 and (crm->>'matches')::int = 0 and crm->>'lastActiveAt' is not null, crm::text;
  assert crm->'app'->'developer'->>'handle' = 'bob', crm::text;
  -- Carol and Erin opened crm-live this week.
  assert (r->'totals'->>'activePlayers')::int >= 2, (r->'totals')::text;
  assert (r->'totals'->>'matches')::int = (select sum((d->>'matches')::int) from jsonb_array_elements(r->'series') d), 'series sums';
end $$;

do $$
declare
  r jsonb;
  carol jsonb;
begin
  r := public.admin_players();
  assert (r->>'total')::int = (select count(*) from public.profiles where not is_bot), r->>'total';
  assert not exists (select 1 from jsonb_array_elements(r->'players') p where (p->'profile'->>'isBot')::boolean), 'no bots';
  assert not exists (select 1 from jsonb_array_elements(r->'players') p where p ? 'email'), 'no emails';
  r := public.admin_players('@CAROL');
  carol := r->'players'->0;
  assert jsonb_array_length(r->'players') = 1 and carol->'profile'->>'handle' = 'carol', r::text;
  assert (carol->>'opens')::int >= 2 and (carol->>'apps')::int >= 1 and carol->>'lastSeenAt' is not null and carol->>'joinedAt' is not null, carol::text;
  assert jsonb_array_length(public.admin_players(null, 1)->'players') = 1, 'limit';
end $$;
