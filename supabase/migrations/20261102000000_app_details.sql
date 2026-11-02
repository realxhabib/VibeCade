-- =============================================================================
-- App details: developers change their app's listing, art and progress
-- without shipping a new version.
--
--  * update_app_details(p_app, p_details): p_details is an object with any of
--    name, tagline, description, category, icon, iconImage, coverImage,
--    accent, howTo, stats, achievements (other keys are ignored: the URL and
--    the gameplay fields still need a version). The app row and every version
--    that isn't history (draft, in_review, approved, rejected, published)
--    take the new values, so a later publish doesn't bring the old ones back.
--    Each manifest is checked whole (app_version_manifest), like a version.
--    Owner only (managed_app: 42501 for anyone else, official apps included);
--    22023 for an invalid or empty change. Returns app_row_json.
-- Mirrors the demo backend (DemoBackend.updateAppDetails). Safe to re-run.
-- =============================================================================

create or replace function public.update_app_details(p_app text, p_details jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.apps := public.managed_app(p_app);
  v_keys constant text[] := array['name', 'tagline', 'description', 'category', 'icon', 'iconImage', 'coverImage',
                                  'accent', 'howTo', 'stats', 'achievements'];
  v_patch jsonb;
  v_listing jsonb;
  v record;
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'Details must be an object' using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(k, p_details->k), '{}'::jsonb) into v_patch
    from unnest(v_keys) k
   where p_details ? k;
  if v_patch = '{}'::jsonb then
    raise exception 'Nothing to change' using errcode = '22023';
  end if;

  select * into a from public.apps where slug = a.slug for update;
  v_listing := public.app_version_manifest(public.app_row_manifest(a) || v_patch);

  for v in
    select id, manifest from public.app_versions
     where app_slug = a.slug and status in ('draft', 'in_review', 'approved', 'rejected', 'published')
       for update
  loop
    update public.app_versions
       set manifest = public.app_version_manifest(v.manifest || v_patch)
     where id = v.id;
  end loop;

  a := public.app_with_manifest(a, v_listing, null);
  update public.apps
     set name = a.name, tagline = a.tagline, description = a.description, category = a.category,
         icon = a.icon, icon_image = a.icon_image, cover_image = a.cover_image,
         accent_from = a.accent_from, accent_to = a.accent_to, how_to = a.how_to,
         stats = a.stats, achievements = a.achievements, updated_at = now()
   where slug = a.slug
  returning * into a;
  return public.app_row_json(a);
end;
$$;

revoke execute on function public.update_app_details(text, jsonb) from public, anon;
grant execute on function public.update_app_details(text, jsonb) to authenticated;
