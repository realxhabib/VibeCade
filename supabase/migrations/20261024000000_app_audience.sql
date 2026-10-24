-- =============================================================================
-- App audience: developers see who plays their app (a small CRM in the
-- console's Players tab) and the emails of players who chose to share theirs.
--
--  * app_audience (app_slug, user_id): per person per app, standalone-app
--    opens (first/last/count) and email_shared_at (null = not shared). RLS:
--    a signed-in user reads only their own rows; nobody writes the table
--    directly (open_app and set_app_email_sharing are the only ways in).
--  * open_app records signed-in opens of the live app (test builds don't count).
--  * set_app_email_sharing(p_app, p_on): the viewer shares their sign-in email
--    with the app's developer (true) or stops sharing (false); idempotent;
--    returns whether it's shared. Sharing needs an app the viewer can see;
--    stopping always works. Emails are never shared by default.
--  * app_players(p_app, p_query, p_limit): owner/admin roster. Everyone who
--    took a seat in a live (non-test) match, opened the app signed in, or
--    shared their email: matches, wins, opens, first/last seen and the email
--    only when that player shares it. Newest activity first; p_query filters
--    by handle or name; p_limit clamped to 1–1000 (default 500). Totals cover
--    the whole roster: { total, emailsShared, newThisWeek, players }.
-- Mirrors the demo backend (platform/demo/audience.ts). Safe to re-run.
-- =============================================================================

create table if not exists public.app_audience (
  app_slug text not null references public.apps (slug) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  opens integer not null default 0 check (opens >= 0),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  email_shared_at timestamptz,
  primary key (app_slug, user_id)
);
create index if not exists app_audience_user_idx on public.app_audience (user_id);

alter table public.app_audience enable row level security;
revoke all on public.app_audience from public, anon, authenticated;
grant select on public.app_audience to authenticated;
drop policy if exists "people see their own audience rows" on public.app_audience;
create policy "people see their own audience rows" on public.app_audience
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Opens
-- ---------------------------------------------------------------------------

-- As in 20261006000100_standalone_apps.sql, plus: signed-in opens of the live app land in app_audience.
create or replace function public.open_app(p_app text, p_version uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  a public.apps;
  v public.app_versions;
begin
  if p_version is null then
    a := public.playable_app(p_app);
  else
    if auth.uid() is null then
      raise exception 'Sign in to open test builds' using errcode = '28000';
    end if;
    v_me := auth.uid();
    select * into v from public.app_versions where id = p_version;
    if not found or v.app_slug is distinct from p_app then
      raise exception 'Version not found' using errcode = 'P0002';
    end if;
    if not public.can_test_app(p_app, v_me) then
      raise exception 'Only the developer and testers can open test builds' using errcode = '42501';
    end if;
    if v.status = 'published' then
      raise exception 'That version is live — open the app itself' using errcode = '22023';
    end if;
    select * into a from public.apps where slug = p_app;
    a := public.app_with_manifest(a, v.manifest, v.url);
  end if;
  if a.kind is distinct from 'app' then
    raise exception '% is a game: play it in a match', a.name using errcode = '22023';
  end if;
  if p_version is null then
    update public.apps set play_count = play_count + 1 where slug = a.slug
    returning play_count into a.play_count;
    if auth.uid() is not null and exists (select 1 from public.profiles where id = auth.uid()) then
      insert into public.app_audience as x (app_slug, user_id, opens, first_opened_at, last_opened_at)
      values (a.slug, auth.uid(), 1, now(), now())
      on conflict (app_slug, user_id) do update
        set opens = x.opens + 1,
            first_opened_at = coalesce(x.first_opened_at, excluded.first_opened_at),
            last_opened_at = excluded.last_opened_at;
    end if;
  end if;
  return public.app_row_json(a) || jsonb_build_object('versionId', p_version);
end;
$$;

-- ---------------------------------------------------------------------------
-- Email sharing (opt in, per app)
-- ---------------------------------------------------------------------------

create or replace function public.set_app_email_sharing(p_app text, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_user();
  a public.apps;
begin
  if p_on is null then
    raise exception 'Say whether to share your email' using errcode = '22023';
  end if;
  select * into a from public.apps where slug = p_app;
  if not found or (p_on and a.status <> 'published' and not public.can_test_app(a.slug, v_me)) then
    raise exception 'App not found' using errcode = 'P0002';
  end if;
  if p_on then
    insert into public.app_audience as x (app_slug, user_id, email_shared_at)
    values (a.slug, v_me, now())
    on conflict (app_slug, user_id) do update
      set email_shared_at = coalesce(x.email_shared_at, excluded.email_shared_at);
  else
    update public.app_audience set email_shared_at = null where app_slug = a.slug and user_id = v_me;
  end if;
  return p_on;
end;
$$;

-- ---------------------------------------------------------------------------
-- The roster
-- ---------------------------------------------------------------------------

create or replace function public.app_players(p_app text, p_query text default null, p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.apps := public.insight_app(p_app);
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 1000));
  v_query text := nullif(lower(btrim(coalesce(p_query, ''), ' @')), '');
  result jsonb;
begin
  with seats as (
    select mp.user_id, mp.result, m.created_at
      from public.match_players mp
      join public.matches m on m.id = mp.match_id
     where m.app_slug = a.slug and m.version_id is null
       and mp.role = 'player' and not mp.is_bot and mp.state in ('joined', 'submitted', 'left')
  ),
  played as (
    select s.user_id, count(*) as matches, count(*) filter (where s.result = 'win') as wins,
           min(s.created_at) as first_at, max(s.created_at) as last_at
      from seats s group by s.user_id
  ),
  aud as (
    select * from public.app_audience x where x.app_slug = a.slug
  ),
  roster as (
    select coalesce(pl.user_id, au.user_id) as user_id,
           coalesce(pl.matches, 0) as matches, coalesce(pl.wins, 0) as wins, coalesce(au.opens, 0) as opens,
           least(pl.first_at, au.first_opened_at) as first_seen,
           greatest(pl.last_at, au.last_opened_at) as last_seen,
           au.email_shared_at
      from played pl
      full join aud au on au.user_id = pl.user_id
  ),
  people as (
    select r.*, p as prof, p.handle, p.name,
           case when r.email_shared_at is not null then nullif(u.email, '') end as email
      from roster r
      join public.profiles p on p.id = r.user_id
      left join auth.users u on u.id = r.user_id
  ),
  page as (
    select * from people x
     where v_query is null or x.handle like '%' || v_query || '%' or lower(x.name) like '%' || v_query || '%'
     order by x.last_seen desc nulls last, x.handle
     limit v_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from people),
    'emailsShared', (select count(*) from people x where x.email is not null),
    'newThisWeek', (select count(*) from people x where x.first_seen >= now() - interval '7 days'),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'profile', public.profile_json(x.prof), 'matches', x.matches, 'wins', x.wins, 'opens', x.opens,
               'firstSeenAt', x.first_seen, 'lastSeenAt', x.last_seen,
               'email', x.email, 'emailSharedAt', case when x.email is not null then x.email_shared_at end
             ) order by x.last_seen desc nulls last, x.handle), '[]'::jsonb)
        from page x
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function public.set_app_email_sharing(text, boolean) from public, anon;
grant execute on function public.set_app_email_sharing(text, boolean) to authenticated;
revoke execute on function public.app_players(text, text, integer) from public, anon;
grant execute on function public.app_players(text, text, integer) to authenticated;
