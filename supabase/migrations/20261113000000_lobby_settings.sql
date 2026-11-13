-- Lobby settings: the host of a `setup: true` app can change the match
-- options (the app's own setup screen) while the lobby fills, before the
-- match starts. Everyone at the table sees the change through the matches
-- row's realtime update. The platform keys stay the platform's: `quick`
-- is kept as it was; `_summary` (the setup screen's one-line summary) is
-- written here from p_summary.

create or replace function public.update_match_settings(p_match uuid, p_settings jsonb, p_summary text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_user();
  v_old jsonb;
  v_setup boolean;
  v_new jsonb := coalesce(p_settings, '{}'::jsonb);
  v_summary text := nullif(left(btrim(coalesce(p_summary, '')), 140), '');
begin
  if jsonb_typeof(v_new) <> 'object' then
    raise exception 'Match settings must be an object' using errcode = '22023';
  end if;
  if octet_length(v_new::text) > 4096 then
    raise exception 'Match settings are too large' using errcode = '22023';
  end if;

  select m.settings, a.has_setup into v_old, v_setup
    from public.matches m join public.apps a on a.slug = m.app_slug
   where m.id = p_match and m.created_by = v_me and m.status in ('open', 'pending')
   for update of m;
  if not found then
    raise exception 'Only the host can change the options before the match starts' using errcode = '55000';
  end if;
  if not v_setup then
    raise exception 'This game has no match options' using errcode = '22023';
  end if;

  v_new := v_new - 'quick' - '_summary';
  if v_old ? 'quick' then
    v_new := v_new || jsonb_build_object('quick', v_old -> 'quick');
  end if;
  if v_summary is not null then
    v_new := v_new || jsonb_build_object('_summary', v_summary);
  end if;

  update public.matches set settings = v_new, updated_at = now() where id = p_match;
end;
$$;

revoke execute on function public.update_match_settings(uuid, jsonb, text) from public, anon;
grant execute on function public.update_match_settings(uuid, jsonb, text) to authenticated;
