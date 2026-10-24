-- =============================================================================
-- Keep a week of pg_cron run history.
--
-- pg_cron records every run in cron.job_run_details and never deletes them:
-- with two jobs running every minute (webhooks, abandoned matches) the table
-- grows by about half a megabyte a day. A daily job deletes runs older than
-- 7 days, its own included, which is enough to see whether a job has been
-- failing. Safe to re-run.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'cron' and p.proname = 'schedule') then
    raise notice 'pg_cron is not available: no run history to clean up';
    return;
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'cron' and c.relname = 'job') then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = ''xapps-cron-history''';
  end if;
  execute $cmd$select cron.schedule('xapps-cron-history', '41 3 * * *',
    $sql$delete from cron.job_run_details where start_time < now() - interval '7 days'$sql$)$cmd$;
end $$;
