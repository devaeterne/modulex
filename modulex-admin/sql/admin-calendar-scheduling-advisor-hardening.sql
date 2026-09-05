begin;

-- Admin Calendar post-migration advisor hardening.
-- Keep the existing canonical Project target-date index and add the covering
-- index required by the composite Google mirror binding foreign key.

drop index if exists public.customer_projects_target_date_calendar_idx;

create index if not exists google_calendar_event_mirror_binding_calendar_idx
  on public.google_calendar_event_mirror(project_calendar_binding_id, admin_calendar_id);

commit;
