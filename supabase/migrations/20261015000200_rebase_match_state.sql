-- =============================================================================
-- Picking a match's state back up after a live server room.
--
-- In liveServer matches (Frontline) the room on the Claude Arcade server holds
-- the shared state while the match is played: players' writes go to the room,
-- which numbers them on from the version it was seeded with, and nothing is
-- written here until the results. If the room becomes unavailable mid-match,
-- the players' hosts fall back to writing here, but this copy is still at the
-- version from before the match, so compare-and-set from their newer copy
-- can never succeed. rebase_match_state stores their copy at its own (higher)
-- version; from then on update_match_state works as usual. A host only calls
-- it when this copy is behind its own; two hosts racing get an ordinary
-- conflict and re-read.
--
-- Safe to re-run.
-- =============================================================================

create or replace function public.rebase_match_state(p_match uuid, p_state jsonb, p_version integer)
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
    -- Final, like update_match_state: never 55000, which clients would retry.
    raise exception 'This match isn''t running' using errcode = '42501';
  end if;
  if p_state is not null and octet_length(p_state::text) > 65536 then
    raise exception 'Match state is too large (max 64 KB)' using errcode = '22023';
  end if;
  if p_version is null or p_version > m.state_version + 1000000 then
    raise exception 'Invalid state version' using errcode = '22023';
  end if;
  if p_version <= m.state_version then
    -- Someone got here first (or this copy isn't behind): an ordinary conflict. PT409, never 40001.
    raise exception 'state_conflict' using errcode = 'PT409',
      detail = format('version %s isn''t ahead of the current version %s', p_version, m.state_version);
  end if;
  update public.matches
     set state = p_state, state_version = p_version, updated_at = now()
   where id = p_match;
  return p_version;
end;
$$;

revoke execute on function public.rebase_match_state(uuid, jsonb, integer) from public, anon;
grant execute on function public.rebase_match_state(uuid, jsonb, integer) to authenticated;
