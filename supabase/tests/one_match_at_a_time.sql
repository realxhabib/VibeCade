-- One live game at a time (20261023000100_one_match_at_a_time.sql). Runs after lifecycle.sql.
\set ON_ERROR_STOP on
\set QUIET on

create function pg_temp.login(p_handle text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where handle = p_handle), ''), false);
$$;
grant execute on function pg_temp.login(text) to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000001a1', null, '{"user_name":"om_ann","full_name":"Ann"}'),
  ('a0000000-0000-4000-8000-0000000001b1', null, '{"user_name":"om_ben","full_name":"Ben"}');

create temporary table om (k text primary key, v uuid);
grant all on om to authenticated;

-- Ann and Ben are playing a live Quick Draw.
set role authenticated;
select pg_temp.login('om_ann');
insert into om values ('live', public.create_challenge('quick-draw', 'live', 'om_ben'));
select pg_temp.login('om_ben');
select public.join_match((select v from om where k = 'live'));
select public.mark_started((select v from om where k = 'live'));
select pg_temp.login('om_ann');
select public.mark_started((select v from om where k = 'live'));
do $$
begin
  assert public.get_match((select v from om where k = 'live'))->>'status' = 'active', 'both playing';
end $$;

-- Ann starts a practice game: she leaves the live one and Ben wins by forfeit.
insert into om values ('prac', public.start_practice('quick-draw'));
select public.mark_started((select v from om where k = 'prac'));
do $$
declare m jsonb := public.get_match((select v from om where k = 'live'));
begin
  assert m->>'status' = 'completed', m->>'status';
  assert m->>'winnerId' = 'a0000000-0000-4000-8000-0000000001b1', m->>'winnerId';
end $$;

-- Another practice game cancels the first; starting the same one again changes nothing.
insert into om values ('prac2', public.start_practice('quick-draw'));
select public.mark_started((select v from om where k = 'prac2'));
select public.mark_started((select v from om where k = 'prac2'));
do $$
begin
  assert public.get_match((select v from om where k = 'prac'))->>'status' = 'cancelled', 'first practice cancelled';
  assert public.get_match((select v from om where k = 'prac2'))->>'status' = 'active', 'second practice running';
end $$;
reset role;
