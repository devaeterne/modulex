begin;

alter table public.google_calendar_event_mirror
  add column if not exists provider_background_color text,
  add column if not exists provider_foreground_color text;

commit;
