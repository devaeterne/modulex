begin;

create index if not exists project_calendar_event_links_binding_project_idx
  on public.project_calendar_event_links(project_calendar_binding_id, project_id);

commit;
