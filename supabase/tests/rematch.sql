-- Rematch (20261015000400_rematch.sql): both presses meet in one match. Runs after lifecycle.sql.
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

-- Fresh people, so lifecycle.sql's open challenges don't count against anyone.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-00000000000a', null, '{"user_name":"rm_ann","full_name":"Ann"}'),
  ('a0000000-0000-4000-8000-00000000000b', null, '{"user_name":"rm_ben","full_name":"Ben"}'),
  ('a0000000-0000-4000-8000-00000000000c', null, '{"user_name":"rm_cat","full_name":"Cat"}');

create temporary table rm (k text primary key, v uuid);
grant all on rm to authenticated;

-- Ann beats Ben at a live Quick Draw.
set role authenticated;
select pg_temp.login('rm_ann');
insert into rm values ('done', public.create_challenge('quick-draw', 'live', 'rm_ben', '{"topic":"cats"}'));
select pg_temp.login('rm_ben');
select public.join_match((select v from rm where k = 'done'));
select public.mark_started((select v from rm where k = 'done'));
select public.submit_entry((select v from rm where k = 'done'), null, 1);
select pg_temp.login('rm_ann');
select public.submit_entry((select v from rm where k = 'done'), null, 3);

-- Not over yet, practice, and people who didn't play are refused.
insert into rm values ('pending', public.create_challenge('quick-draw', 'live', 'rm_ben'));
select pg_temp.expect(format('select public.rematch(%L)', (select v from rm where k = 'pending')), '55000');
select pg_temp.expect(format('select public.rematch(%L)', public.start_practice('quick-draw')), 'P0002');
select pg_temp.login('rm_cat');
select pg_temp.expect(format('select public.rematch(%L)', (select v from rm where k = 'done')), '42501');

-- Ann asks first: Ben is invited back to the same setup; asking again goes back to it.
select pg_temp.login('rm_ann');
insert into rm values ('first', public.rematch((select v from rm where k = 'done')));
do $$
declare m jsonb := public.get_match((select v from rm where k = 'first'));
begin
  assert m->>'status' = 'pending', m->>'status';
  assert m->'settings' = '{"topic":"cats"}'::jsonb, m->>'settings';
  assert m->'players'->1->>'state' = 'invited', 'ben invited';
  assert public.rematch((select v from rm where k = 'done')) = (select v from rm where k = 'first'), 'asking twice';
end $$;

-- Ben presses Rematch too: he takes his seat in Ann's instead of inviting her to another.
select pg_temp.login('rm_ben');
do $$
declare m jsonb;
begin
  assert public.rematch((select v from rm where k = 'done')) = (select v from rm where k = 'first'), 'ben joins ann''s rematch';
  m := public.get_match((select v from rm where k = 'first'));
  assert m->>'status' = 'active', m->>'status';
  assert m->'players'->1->>'state' = 'joined', 'ben joined';
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.matches where settings = '{"topic":"cats"}'::jsonb) = 2, 'one rematch, not two';
end $$;

-- A declined rematch is replaced by a new one.
set role authenticated;
select public.mark_started((select v from rm where k = 'first'));
select public.submit_entry((select v from rm where k = 'first'), null, 1);
select pg_temp.login('rm_ann');
select public.submit_entry((select v from rm where k = 'first'), null, 3);
insert into rm values ('second', public.rematch((select v from rm where k = 'first')));
select pg_temp.login('rm_ben');
select public.decline_match((select v from rm where k = 'second'));
insert into rm values ('third', public.rematch((select v from rm where k = 'first')));
do $$
declare m jsonb := public.get_match((select v from rm where k = 'third'));
begin
  assert (select v from rm where k = 'third') <> (select v from rm where k = 'second'), 'a new rematch';
  assert m->>'status' = 'pending', m->>'status';
  assert m->'players'->0->>'state' = 'joined', 'ben asked';
  assert m->'players'->1->>'state' = 'invited', 'ann invited';
end $$;
reset role;

\echo 'Rematch checks passed ✔'
