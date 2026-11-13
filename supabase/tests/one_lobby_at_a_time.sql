-- One lobby at a time (20261114000000_one_lobby_at_a_time.sql). Frontline is a 2-8 player live app after sync-apps.
\set ON_ERROR_STOP on
\set QUIET on

create function pg_temp.login(p_handle text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where handle = p_handle), ''), false);
$$;
grant execute on function pg_temp.login(text) to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('c1000000-0000-4000-8000-00000000000a', null, '{"user_name":"ol_ann","full_name":"Ann"}'),
  ('c1000000-0000-4000-8000-00000000000b', null, '{"user_name":"ol_ben","full_name":"Ben"}'),
  ('c1000000-0000-4000-8000-00000000000c', null, '{"user_name":"ol_cat","full_name":"Cat"}');

create temporary table ol (k text primary key, v uuid);
grant all on ol to authenticated;

create function pg_temp.seated(p_key text, p_handle text) returns boolean language sql as $$
  select exists (select 1 from public.match_players mp join public.profiles p on p.id = mp.user_id
                  where mp.match_id = (select v from ol where k = p_key) and p.handle = p_handle and mp.role = 'player');
$$;
create function pg_temp.status(p_key text) returns text language sql as $$
  select status from public.matches where id = (select v from ol where k = p_key);
$$;
grant execute on function pg_temp.seated(text, text), pg_temp.status(text) to authenticated;

set role authenticated;

-- Ann and Cat each host an open Frontline lobby; Ben joins Ann's, then Cat's: he leaves Ann's.
select pg_temp.login('ol_ann');
insert into ol values ('a', public.create_challenge('frontline', 'live'));
select pg_temp.login('ol_cat');
insert into ol values ('c', public.create_challenge('frontline', 'live'));
select pg_temp.login('ol_ben');
select public.join_match((select v from ol where k = 'a'));
do $$ begin assert pg_temp.seated('a', 'ol_ben'), 'Ben in Ann''s lobby'; end $$;
select public.join_match((select v from ol where k = 'c'));
do $$
begin
  assert not pg_temp.seated('a', 'ol_ben'), 'Ben left Ann''s lobby';
  assert pg_temp.seated('c', 'ol_ben'), 'Ben in Cat''s lobby';
  assert pg_temp.status('a') = 'open', 'Ann''s lobby still open';
  assert (select is_open from public.matches where id = (select v from ol where k = 'a')), 'seat free again';
end $$;

-- Ann challenges Cat to Quick Draw: her own Frontline lobby is cancelled.
select pg_temp.login('ol_ann');
insert into ol values ('d', public.create_challenge('quick-draw', 'live', 'ol_cat'));
do $$ begin assert pg_temp.status('a') = 'cancelled', pg_temp.status('a'); end $$;

-- Cat accepts: her lobby (with Ben in it) is cancelled, and the duel starts.
select pg_temp.login('ol_cat');
select public.join_match((select v from ol where k = 'd'));
do $$
begin
  assert pg_temp.status('c') = 'cancelled', pg_temp.status('c');
  assert pg_temp.status('d') = 'active', pg_temp.status('d');
end $$;

-- Joining the same lobby again, or a match that's running, changes nothing.
select public.join_match((select v from ol where k = 'd'));
do $$ begin assert pg_temp.status('d') = 'active', 'still on'; end $$;

-- Ben waits in a fresh lobby of Cat's, then starts a practice game: he leaves the lobby.
select pg_temp.login('ol_ben');
insert into ol values ('e', public.create_challenge('frontline', 'live'));
select pg_temp.login('ol_ann');
select public.join_match((select v from ol where k = 'e'));
insert into ol values ('p', public.start_practice('quick-draw'));
do $$ begin assert pg_temp.seated('e', 'ol_ann'), 'practice created, not started yet'; end $$;
select public.mark_started((select v from ol where k = 'p'));
do $$
begin
  assert not pg_temp.seated('e', 'ol_ann'), 'Ann left Ben''s lobby';
  assert pg_temp.status('e') = 'open', 'Ben''s lobby goes on';
end $$;

-- A private lobby that's short of players once someone leaves is declined.
select pg_temp.login('ol_ann');
insert into ol values ('f', public.create_challenge('frontline', 'live', null, '{}', array['ol_ben', 'ol_cat'], 3));
select pg_temp.login('ol_ben');
select public.join_match((select v from ol where k = 'f'));
do $$ begin assert pg_temp.status('f') = 'pending', pg_temp.status('f'); end $$;
select public.quick_match('frontline');
do $$
begin
  assert not pg_temp.seated('f', 'ol_ben'), 'Ben left the private lobby';
  assert pg_temp.status('f') = 'pending', 'Ann and the invited Cat still make two';
end $$;
reset role;

\echo 'One lobby at a time checks passed ✔'
