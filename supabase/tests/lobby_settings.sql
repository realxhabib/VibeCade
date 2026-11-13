-- Lobby settings (Frontline is a setup app after sync-apps; 20261113000000_lobby_settings.sql): the host changes a setup app's options before the start.
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

insert into auth.users (id, email, raw_user_meta_data) values
  ('b1000000-0000-4000-8000-00000000000a', null, '{"user_name":"ls_ann","full_name":"Ann"}'),
  ('b1000000-0000-4000-8000-00000000000b', null, '{"user_name":"ls_ben","full_name":"Ben"}');

create temporary table ls (k text primary key, v uuid);
grant all on ls to authenticated;

set role authenticated;
select pg_temp.login('ls_ann');
insert into ls values ('fl', public.create_challenge('frontline', 'live', 'ls_ben', '{"min":5}'));

-- The host replaces the options; `quick` stays the platform's and the summary rides along as `_summary`.
select public.update_match_settings((select v from ls where k = 'fl'), '{"topic":"dogs","quick":true,"_summary":"forged"}', '  Dogs  ');
do $$
declare m jsonb := public.get_match((select v from ls where k = 'fl'));
begin
  assert m->'settings' = '{"topic":"dogs","_summary":"Dogs"}'::jsonb, m->>'settings';
end $$;
select public.update_match_settings((select v from ls where k = 'fl'), '{"topic":"owls"}');
do $$
begin
  assert public.get_match((select v from ls where k = 'fl'))->'settings' = '{"topic":"owls"}'::jsonb, 'no summary';
end $$;

-- Bad input.
select pg_temp.expect(format('select public.update_match_settings(%L, %L)', (select v from ls where k = 'fl'), '[1]'), '22023');
select pg_temp.expect(format('select public.update_match_settings(%L, %L)', (select v from ls where k = 'fl'), jsonb_build_object('x', repeat('a', 5000))), '22023');

-- Only the host, only before the start, only setup apps.
select pg_temp.login('ls_ben');
select pg_temp.expect(format('select public.update_match_settings(%L, %L)', (select v from ls where k = 'fl'), '{}'), '55000');
select pg_temp.login('ls_ann');
insert into ls values ('draw', public.create_challenge('quick-draw', 'live', 'ls_ben'));
select pg_temp.expect(format('select public.update_match_settings(%L, %L)', (select v from ls where k = 'draw'), '{}'), '22023');
select public.cancel_match((select v from ls where k = 'draw'));
select pg_temp.login('ls_ben');
select public.join_match((select v from ls where k = 'fl'));
select pg_temp.login('ls_ann');
select pg_temp.expect(format('select public.update_match_settings(%L, %L)', (select v from ls where k = 'fl'), '{}'), '55000');

reset role;

\echo 'Lobby settings checks passed ✔'
