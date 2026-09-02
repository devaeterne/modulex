-- Mirror of modulex-admin/sql/commercial-document-branding.sql.
-- Shared production database migration for Admin-managed Order / Invoice branding.

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
