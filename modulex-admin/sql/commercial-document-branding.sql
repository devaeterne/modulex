-- Commercial document branding slots for shared Order / Invoice A4 output.
-- Additive and backwards-compatible: existing logo_url remains the primary-on-light fallback.

alter table public.general_settings
  add column if not exists primary_logo_on_light_url text,
  add column if not exists primary_logo_on_dark_url text,
  add column if not exists secondary_logo_on_light_url text,
  add column if not exists secondary_logo_on_dark_url text;

comment on column public.general_settings.primary_logo_on_light_url is
  'Primary company logo optimized for light backgrounds and printable/PDF commercial documents.';
comment on column public.general_settings.primary_logo_on_dark_url is
  'Primary company logo optimized for dark application surfaces.';
comment on column public.general_settings.secondary_logo_on_light_url is
  'Secondary brand logo optimized for light backgrounds and printable/PDF commercial documents.';
comment on column public.general_settings.secondary_logo_on_dark_url is
  'Secondary brand logo optimized for dark application surfaces.';

notify pgrst, 'reload schema';
