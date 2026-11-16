-- When each app first went public, so the home page spotlight can show newly
-- published games. A community app is registered (created_at) long before
-- review approves it; published_at is the moment it first became 'published'
-- and never moves after that (later versions don't make it "new" again).

alter table public.apps add column if not exists published_at timestamptz;

-- Backfill: the first published version, else the row's own creation time.
update public.apps a
   set published_at = coalesce(
         (select min(v.published_at) from public.app_versions v where v.app_slug = a.slug and v.published_at is not null),
         a.created_at)
 where a.status = 'published' and a.published_at is null;

create or replace function public.apps_set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Set once, by the database only.
    new.published_at := old.published_at;
  else
    new.published_at := null;
  end if;
  if new.published_at is null and new.status = 'published' then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists apps_set_published_at on public.apps;
create trigger apps_set_published_at
  before insert or update on public.apps
  for each row execute function public.apps_set_published_at();

revoke execute on function public.apps_set_published_at() from public, anon, authenticated;
