alter table public.store_marketing_settings
  drop constraint if exists store_marketing_tracking_requires_consent;
alter table public.store_marketing_settings
  add constraint store_marketing_tracking_requires_consent
  check (not tracking_enabled or consent_banner_enabled);

alter table public.store_marketing_settings
  drop constraint if exists store_marketing_tracking_requires_provider;
alter table public.store_marketing_settings
  add constraint store_marketing_tracking_requires_provider
  check (
    not tracking_enabled
    or google_tag_manager_id is not null
    or google_analytics_measurement_id is not null
  );
