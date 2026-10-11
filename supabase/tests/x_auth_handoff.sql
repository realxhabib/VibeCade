-- Sign-in hand-off for playable posts (20261011000000_x_auth_handoff.sql). Runs after lifecycle.sql, on its users.
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

-- Signed out, the popup can't park anything; nobody touches the table directly.
set role anon;
select pg_temp.login('');
select pg_temp.expect($$select public.put_x_auth_handoff('abcdefghijklmnopqrstuvwxyz0123456789', 'a', 'r')$$, '42501');
select pg_temp.expect($$select * from public.x_auth_handoffs$$, '42501');
reset role;

set role authenticated;
select pg_temp.login('carol');
select pg_temp.expect($$select public.put_x_auth_handoff('short', 'a', 'r')$$, '22023');
select pg_temp.expect($$select public.put_x_auth_handoff('abcdefghijklmnopqrstuvwxyz0123456789', '', 'r')$$, '22023');
select pg_temp.expect($$select * from public.x_auth_handoffs$$, '42501');
select public.put_x_auth_handoff('abcdefghijklmnopqrstuvwxyz0123456789', 'access-1', 'refresh-1');
reset role;

do $$
begin
  assert (select count(*) from public.x_auth_handoffs) = 1, 'parked';
  assert (select nonce_hash from public.x_auth_handoffs) <> 'abcdefghijklmnopqrstuvwxyz0123456789', 'only the hash is stored';
end $$;

-- The card claims it once, signed out; a wrong code gets nothing.
set role anon;
select pg_temp.login('');
do $$
declare r jsonb;
begin
  assert public.claim_x_auth_handoff('wrongwrongwrongwrongwrongwrongwrong') is null, 'wrong code';
  assert public.claim_x_auth_handoff('nope') is null, 'malformed code';
  r := public.claim_x_auth_handoff('abcdefghijklmnopqrstuvwxyz0123456789');
  assert r ->> 'access_token' = 'access-1' and r ->> 'refresh_token' = 'refresh-1', format('claimed %s', r);
  assert public.claim_x_auth_handoff('abcdefghijklmnopqrstuvwxyz0123456789') is null, 'only once';
end $$;
reset role;

-- Expired hand-offs can't be claimed, and get swept.
insert into public.x_auth_handoffs (nonce_hash, user_id, access_token, refresh_token, created_at)
values (public.x_auth_nonce_hash('expiredexpiredexpiredexpiredexpired'), (select id from public.profiles where handle = 'carol'), 'a', 'r', now() - interval '6 minutes');
insert into public.x_auth_handoffs (nonce_hash, user_id, access_token, refresh_token, created_at)
values (public.x_auth_nonce_hash('stalestalestalestalestalestalestale'), (select id from public.profiles where handle = 'carol'), 'a', 'r', now() - interval '6 minutes');
set role anon;
do $$
begin
  assert public.claim_x_auth_handoff('expiredexpiredexpiredexpiredexpired') is null, 'expired';
end $$;
reset role;
do $$
begin
  assert not exists (select 1 from public.x_auth_handoffs), 'claiming swept the stale one too';
end $$;

-- At most 5 in flight per person.
set role authenticated;
select pg_temp.login('bob');
select public.put_x_auth_handoff('bobnonce' || i || 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'a', 'r') from generate_series(1, 5) i;
select pg_temp.expect($$select public.put_x_auth_handoff('bobnonce6xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'a', 'r')$$, 'P0001');
reset role;
delete from public.x_auth_handoffs;

\echo 'X sign-in hand-off checks passed ✔'
