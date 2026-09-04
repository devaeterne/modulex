begin;

alter table public.project_calendar_event_links
  drop constraint if exists project_calendar_event_links_sync_status_valid;

alter table public.project_calendar_event_links
  add constraint project_calendar_event_links_sync_status_valid
  check (sync_status in ('pending','synced','error','skipped','cancelled'));

commit;
