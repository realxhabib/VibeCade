-- App audience (20261023000000_app_audience.sql). Runs after lifecycle.sql, on its users.
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

-- Bob's published standalone app and his app in review; Carol and Erin have emails.
insert into public.apps (slug, name, tagline, category, url, modes, min_players, max_players, how_to, developer_id, status, kind)
values ('crm-live', 'CRM Live', 'Open me', 'tools', 'https://crm.example.com/live', '{practice}', 1, 1, '{Open}',
        (select id from public.profiles where handle = 'bob'), 'published', 'app'),
       ('crm-review', 'CRM Review', 'Not yet', 'tools', 'https://crm.example.com/review', '{practice}', 1, 1, '{Open}',
        (select id from public.profiles where handle = 'bob'), 'pending', 'app');
update auth.users set email = 'carol@example.com' where id = (select id from public.profiles where handle = 'carol');
update auth.users set email = 'erin@example.com' where id = (select id from public.profiles where handle = 'erin');

-- Signed out opens count toward play_count only; signed-in opens land in app_audience.
set role anon;
select pg_temp.login('nobody');
select public.open_app('crm-live');
set role authenticated;
select pg_temp.login('carol');
select public.open_app('crm-live');
select public.open_app('crm-live');
select pg_temp.login('erin');
select public.open_app('crm-live');

do $$
declare r jsonb;
begin
  -- Erin reads only her own row, and can't write the table.
  assert (select count(*) from public.app_audience) = 1, 'erin sees her row only';
  assert (select email_shared_at from public.app_audience) is null, 'not shared by default';
end $$;
select pg_temp.expect($q$insert into public.app_audience (app_slug, user_id, email_shared_at) values ('crm-live', auth.uid(), now())$q$, '42501');
select pg_temp.expect($q$update public.app_audience set email_shared_at = now()$q$, '42501');

-- Only the owner (or an admin) reads the roster.
select pg_temp.expect($q$select public.app_players('crm-live')$q$, '42501');

-- Bob sees both, emails hidden until shared.
select pg_temp.login('bob');
do $$
declare r jsonb;
begin
  r := public.app_players('crm-live');
  assert (r->>'total')::int = 2 and (r->>'emailsShared')::int = 0 and (r->>'newThisWeek')::int = 2, r::text;
  assert r->'players'->0->'profile'->>'handle' = 'erin', 'most recent first: ' || r::text;
  assert (select (p->>'opens')::int from jsonb_array_elements(r->'players') p where p->'profile'->>'handle' = 'carol') = 2, r::text;
  assert (select bool_and(p->'email' = 'null'::jsonb) from jsonb_array_elements(r->'players') p), 'no emails yet';
end $$;

-- Carol shares (idempotent), Bob sees her email; a search finds just her.
select pg_temp.login('carol');
do $$
begin
  assert public.set_app_email_sharing('crm-live', true), 'shared';
  assert public.set_app_email_sharing('crm-live', true), 'again';
  assert (select email_shared_at from public.app_audience where app_slug = 'crm-live') is not null, 'carol sees it shared';
end $$;
select pg_temp.expect($q$select public.set_app_email_sharing('crm-review', true)$q$, 'P0002');
select pg_temp.login('bob');
do $$
declare r jsonb;
begin
  r := public.app_players('crm-live', '@CAR');
  assert jsonb_array_length(r->'players') = 1 and r->'players'->0->>'email' = 'carol@example.com', r::text;
  assert (r->>'total')::int = 2 and (r->>'emailsShared')::int = 1, 'totals cover the roster: ' || r::text;
  assert r->'players'->0->>'emailSharedAt' is not null, r::text;
  r := public.app_players('crm-live', null, 1);
  assert jsonb_array_length(r->'players') = 1, 'limit';
end $$;

-- Carol stops sharing; she stays on the roster without an email.
select pg_temp.login('carol');
select public.set_app_email_sharing('crm-live', false);
select pg_temp.login('bob');
do $$
declare r jsonb;
begin
  r := public.app_players('crm-live', 'carol');
  assert r->'players'->0->'email' = 'null'::jsonb and (r->>'emailsShared')::int = 0, r::text;
end $$;

reset role;
