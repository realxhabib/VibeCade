-- =============================================================================
-- Sign-in for playable posts (the /x/play player card inside X).
--
-- X frames the card on x.com, where the site's session cookie isn't sent and
-- X's login page won't load, so the card signs in through a popup. The popup
-- can't talk back to the card (X's login page cuts the popup off from its
-- opener, and storage in the frame is partitioned under x.com), so the session
-- goes through here:
--
--  1. The card makes a random code (the nonce) and opens the popup with it.
--  2. The popup signs in with X (its own session, not the site's cookies) and
--     parks that session here with put_x_auth_handoff, keyed by the code's hash.
--  3. The card polls claim_x_auth_handoff with the code: it gets the session
--     once, and the row is gone. Unclaimed rows expire after 5 minutes (each
--     put and claim sweeps them).
--
-- The popup only signs in for a code its opener (our own card) gave it, or
-- after the person confirms the card's short code: see web platform/x-session.ts.
--
-- Nobody reads or writes x_auth_handoffs directly. Safe to re-run.
-- =============================================================================

create table if not exists public.x_auth_handoffs (
  nonce_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  created_at timestamptz not null default now()
);
create index if not exists x_auth_handoffs_user_idx on public.x_auth_handoffs (user_id);

alter table public.x_auth_handoffs enable row level security;
revoke all on public.x_auth_handoffs from public, anon, authenticated;

create or replace function public.x_auth_nonce_hash(p_nonce text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_nonce, 'UTF8')), 'hex');
$$;

-- The popup, signed in: parks its session under the card's code.
create or replace function public.put_x_auth_handoff(p_nonce text, p_access_token text, p_refresh_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'Invalid sign-in code' using errcode = '22023';
  end if;
  if coalesce(p_access_token, '') = '' or coalesce(p_refresh_token, '') = '' then
    raise exception 'Missing session' using errcode = '22023';
  end if;
  delete from public.x_auth_handoffs where created_at < now() - interval '5 minutes';
  if (select count(*) from public.x_auth_handoffs where user_id = v_me) >= 5 then
    raise exception 'Too many sign-ins in progress' using errcode = 'P0001';
  end if;
  insert into public.x_auth_handoffs (nonce_hash, user_id, access_token, refresh_token)
  values (public.x_auth_nonce_hash(p_nonce), v_me, p_access_token, p_refresh_token)
  on conflict (nonce_hash) do nothing;
end;
$$;

-- The card (signed out): takes the session parked under its code, once. Null until the popup is done.
create or replace function public.claim_x_auth_handoff(p_nonce text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.x_auth_handoffs;
begin
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{32,128}$' then
    return null;
  end if;
  delete from public.x_auth_handoffs where created_at < now() - interval '5 minutes';
  delete from public.x_auth_handoffs
   where nonce_hash = public.x_auth_nonce_hash(p_nonce)
  returning * into v_row;
  if v_row.nonce_hash is null or v_row.created_at < now() - interval '5 minutes' then
    return null;
  end if;
  return jsonb_build_object('access_token', v_row.access_token, 'refresh_token', v_row.refresh_token);
end;
$$;

revoke execute on function public.x_auth_nonce_hash(text) from public, anon, authenticated;
revoke execute on function public.put_x_auth_handoff(text, text, text) from public, anon;
revoke execute on function public.claim_x_auth_handoff(text) from public;
grant execute on function public.put_x_auth_handoff(text, text, text) to authenticated;
grant execute on function public.claim_x_auth_handoff(text) to anon, authenticated;
