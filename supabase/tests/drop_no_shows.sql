-- Start without the no-shows (20261023000200_drop_no_shows.sql). Runs after lifecycle.sql.
\set ON_ERROR_STOP on
\set QUIET on

create function pg_temp.login(p_handle text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where handle = p_handle), ''), false);
$$;
grant execute on function pg_temp.login(text) to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-0000000002a1', null, '{"user_name":"ns_ann","full_name":"Ann"}'),
  ('a0000000-0000-4000-8000-0000000002b1', null, '{"user_name":"ns_ben","full_name":"Ben"}');

create temporary table ns (k text primary key, v uuid);
grant all on ns to authenticated;

-- Ann challenges Ben to a live Quick Draw; Ben accepts and never opens it.
set role authenticated;
select pg_temp.login('ns_ann');
insert into ns values ('live', public.create_challenge('quick-draw', 'live', 'ns_ben'));
select pg_temp.login('ns_ben');
select public.join_match((select v from ns where k = 'live'));
select pg_temp.login('ns_ann');

-- Too early: Ben only just joined.
do $$
begin
  perform public.drop_no_shows((select v from ns where k = 'live'), array['a0000000-0000-4000-8000-0000000002b1'::uuid]);
  raise exception 'dropped too early';
exception when sqlstate '55000' then null;
end $$;
reset role;
update public.match_players set joined_at = now() - interval '16 seconds' where match_id = (select v from ns where k = 'live');

-- 15 s on: Ben is dropped, no forfeit. A 1v1 can't go on, so it's called off: nobody wins.
set role authenticated;
select pg_temp.login('ns_ann');
select public.drop_no_shows((select v from ns where k = 'live'), array['a0000000-0000-4000-8000-0000000002b1'::uuid]);
do $$
declare m jsonb := public.get_match((select v from ns where k = 'live'));
begin
  assert m->>'status' = 'cancelled', m->>'status';
  assert m->>'winnerId' is null, m->>'winnerId';
end $$;
reset role;
select (select state from public.match_players where match_id = (select v from ns where k = 'live')
          and user_id = 'a0000000-0000-4000-8000-0000000002b1') = 'declined' as ben_declined \gset
\if :ben_declined
\else
  \echo 'Ben should be declined'
  select 1/0;
\endif
