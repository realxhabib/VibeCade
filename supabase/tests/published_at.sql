-- Published at (20261116000000_app_published_at.sql). Runs after lifecycle.sql, on its users.
\set ON_ERROR_STOP on
\set QUIET on

-- Registered for review: not public yet.
insert into public.apps (slug, name, tagline, category, url, modes, min_players, max_players, how_to, developer_id, status, published_at)
values ('fresh-game', 'Fresh Game', 'Brand new', 'games', 'https://fresh.example.com', '{live}', 2, 2, '{Play}',
        (select id from public.profiles where handle = 'bob'), 'pending', '2000-01-01');
do $$ begin
  assert (select published_at from public.apps where slug = 'fresh-game') is null, 'a pending app has no published_at';
end $$;

-- Review approves it: stamped now.
update public.apps set status = 'published' where slug = 'fresh-game';
do $$ begin
  assert (select published_at from public.apps where slug = 'fresh-game') between now() - interval '1 minute' and now(), 'stamped on publish';
end $$;

-- Set once: neither a client write nor unpublishing and republishing moves it.
update public.apps set published_at = '2000-01-01' where slug = 'fresh-game';
update public.apps set status = 'rejected' where slug = 'fresh-game';
update public.apps set status = 'published' where slug = 'fresh-game';
do $$ begin
  assert (select published_at from public.apps where slug = 'fresh-game') > '2001-01-01', 'published_at never moves';
end $$;

-- Inserted already published (seeds, admins): stamped on insert.
insert into public.apps (slug, name, tagline, category, url, modes, min_players, max_players, how_to, developer_id, status)
values ('seeded-game', 'Seeded Game', 'Was here', 'games', 'https://seeded.example.com', '{live}', 2, 2, '{Play}',
        (select id from public.profiles where handle = 'bob'), 'published');
do $$ begin
  assert (select published_at from public.apps where slug = 'seeded-game') is not null, 'stamped on insert';
end $$;

delete from public.apps where slug in ('fresh-game', 'seeded-game');
