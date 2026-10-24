-- =============================================================================
-- Rematch pairs the players up instead of crossing invites.
--
-- The results screen's Rematch button called create_challenge, so when both
-- players pressed it each one opened a new challenge and invited the other:
-- two pending matches, each waiting on someone who was waiting in the other.
--
-- rematch(p_match) remembers the challenge it opens on the finished match
-- (matches.rematch_id). The first press opens it and invites everyone else who
-- played; a later press by any of them takes their seat in that one (or goes
-- back to it). The finished match's row is locked first, so two presses at the
-- same moment still end up in one match. A rematch that is over, or that this
-- player has declined or left, is replaced by a new one.
--
-- Practice (and rematches against bots) still go through start_practice.
-- Mirrors rematch in the demo backend. Safe to re-run.
-- =============================================================================

alter table public.matches
  add column if not exists rematch_id uuid references public.matches (id) on delete set null;

create or replace function public.rematch(p_match uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_user();
  m public.matches;
  r public.matches;
  v_state text;
  v_handles text[];
  v_id uuid;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or m.mode = 'practice' then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.match_players
     where match_id = p_match and user_id = v_me and role = 'player' and not is_bot
  ) then
    raise exception 'Only players can ask for a rematch' using errcode = '42501';
  end if;
  if m.status <> 'completed' then
    raise exception 'This match isn''t over yet' using errcode = '55000';
  end if;

  -- Someone already asked: sit down in theirs.
  if m.rematch_id is not null then
    select * into r from public.matches where id = m.rematch_id;
    select mp.state into v_state from public.match_players mp
     where mp.match_id = m.rematch_id and mp.user_id = v_me and mp.role = 'player';
    if r.id is not null and r.status in ('open', 'pending', 'active')
       and v_state in ('invited', 'joined', 'submitted') then
      if v_state = 'invited' then
        perform public.join_match(r.id);
      end if;
      return r.id;
    end if;
  end if;

  -- Same table, same setup, everyone else who played invited back.
  select coalesce(array_agg(p.handle order by mp.seat), '{}') into v_handles
    from public.match_players mp
    join public.profiles p on p.id = mp.user_id
   where mp.match_id = p_match and mp.role = 'player' and not mp.is_bot and mp.user_id <> v_me;
  if cardinality(v_handles) = 0 then
    raise exception 'Nobody to rematch' using errcode = '22023';
  end if;
  v_id := public.create_challenge(
    m.app_slug, m.mode, null, m.settings, v_handles,
    case when m.max_players > 2 then m.max_players end, m.version_id
  );
  update public.matches set rematch_id = v_id where id = p_match;
  return v_id;
end;
$$;
