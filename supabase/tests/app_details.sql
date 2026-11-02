-- App details (20261102000000_app_details.sql). Runs after lifecycle.sql, on its users.
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

-- Bob's published game, with a live 1.0.0 and a 1.1.0 draft on a new URL.
insert into public.apps (slug, name, tagline, category, url, modes, min_players, max_players, how_to, developer_id, status)
values ('detail-game', 'Detail Game', 'Tap fast to win', 'games', 'https://detail.example.com/v1', '{live,practice}', 2, 2, '{Tap}',
        (select id from public.profiles where handle = 'bob'), 'published');
set role authenticated;
select pg_temp.login('bob');
select public.create_app_version('detail-game', '1.1.0', 'https://detail.example.com/v2', null, 'Next');

-- Only the developer.
select pg_temp.login('carol');
select pg_temp.expect($q$select public.update_app_details('detail-game', '{"name":"Hijacked"}')$q$, '42501');

select pg_temp.login('bob');
select pg_temp.expect($q$select public.update_app_details('detail-game', '{}')$q$, '22023');
select pg_temp.expect($q$select public.update_app_details('detail-game', '{"url":"https://evil.example.com"}')$q$, '22023');
select pg_temp.expect($q$select public.update_app_details('detail-game', '{"name":"x"}')$q$, '22023');
select pg_temp.expect($q$select public.update_app_details('detail-game', '"name"')$q$, '22023');
do $$
declare
  r jsonb := public.update_app_details('detail-game',
    '{"name":"Detail Deluxe","icon":"🚀","modes":["async"],"url":"https://evil.example.com",
      "achievements":[{"id":"first","name":"First","description":"Win once","icon":"🏆","xp":10}]}');
begin
  assert r->>'name' = 'Detail Deluxe' and r->>'icon' = '🚀' and r->>'url' = 'https://detail.example.com/v1', r::text;
  assert r->'modes' = '["live", "practice"]'::jsonb, 'gameplay fields stay: ' || (r->'modes')::text;
  assert jsonb_array_length(r->'achievements') = 1, r::text;
end $$;
reset role;
do $$
begin
  -- The live version and the draft took the details, kept their own URL and modes.
  assert (select count(*) from public.app_versions where app_slug = 'detail-game' and manifest->>'name' = 'Detail Deluxe'
           and manifest->>'icon' = '🚀' and manifest->'modes' = '["live", "practice"]'::jsonb
           and jsonb_array_length(manifest->'achievements') = 1) = 2, 'both versions updated';
  assert (select url from public.app_versions where app_slug = 'detail-game' and version = '1.1.0') = 'https://detail.example.com/v2', 'draft url kept';
  assert (select count(*) from public.app_versions where app_slug = 'detail-game') = 2, 'no new version';
end $$;
