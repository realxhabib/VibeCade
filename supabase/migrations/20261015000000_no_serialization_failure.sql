-- =============================================================================
-- Never raise 40001 from an RPC.
--
-- update_match_state and app_api_set_state reported a stale expectedVersion as
-- SQLSTATE 40001 (serialization_failure). PostgREST (before v16) treats 40001
-- as transient and re-runs the whole transaction itself, with no limit, so a
-- conflicting write never fails: it repeats inside PostgREST until the match
-- moves on, long after the browser's request timed out (504). One live
-- Frontline match ran five such loops at ~100 writes/s for two hours, saturated
-- the connection pool and 503'd everyone else. This is also what kept the
-- "finished match" loop of 20261007000000_stop_write_loops going.
--
-- A conflict is now PT409: PostgREST answers HTTP 409 and never retries it.
-- The message stays 'state_conflict', which clients already map to "conflict".
-- Safe to re-run.
-- =============================================================================

create or replace function public.update_match_state(p_match uuid, p_state jsonb, p_expected_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_user();
  m public.matches;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or (m.mode = 'practice' and m.created_by <> v_me) then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.match_players
     where match_id = p_match and user_id = v_me and role = 'player' and state in ('joined', 'submitted')
  ) then
    raise exception 'Only seated players can change the match state' using errcode = '42501';
  end if;
  if m.status <> 'active' then
    -- Final, so not 55000: clients map that to "conflict" and re-read and retry, and a tab
    -- left open on a finished match retried this write in a loop for days.
    raise exception 'This match isn''t running' using errcode = '42501';
  end if;
  if p_state is not null and octet_length(p_state::text) > 65536 then
    raise exception 'Match state is too large (max 64 KB)' using errcode = '22023';
  end if;
  if p_expected_version is distinct from m.state_version then
    -- PT409, never 40001: PostgREST retries 40001 itself, forever.
    raise exception 'state_conflict' using errcode = 'PT409',
      detail = format('expected version %s, current version %s', p_expected_version, m.state_version);
  end if;
  update public.matches
     set state = p_state, state_version = state_version + 1, updated_at = now()
   where id = p_match;
  return m.state_version + 1;
end;
$$;

-- Compare-and-set like update_match_state; returns the new version.
create or replace function public.app_api_set_state(p_secret text, p_match uuid, p_state jsonb, p_expected_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches := public.app_api_match(p_secret, p_match, true);
begin
  if m.status <> 'active' then
    raise exception 'This match isn''t running' using errcode = '55000';
  end if;
  if p_expected_version is null then
    raise exception 'expectedVersion is required' using errcode = '22023';
  end if;
  if p_state is not null and octet_length(p_state::text) > 65536 then
    raise exception 'Match state is too large (max 64 KB)' using errcode = '22023';
  end if;
  if p_expected_version <> m.state_version then
    -- PT409, never 40001: PostgREST retries 40001 itself, forever.
    raise exception 'state_conflict' using errcode = 'PT409',
      detail = format('expected version %s, current version %s', p_expected_version, m.state_version);
  end if;
  update public.matches
     set state = p_state, state_version = state_version + 1, updated_at = now()
   where id = p_match;
  return m.state_version + 1;
end;
$$;
