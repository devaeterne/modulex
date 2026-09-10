-- LD Advisor closeout: cover only Lead-domain FK paths introduced/touched here.

begin;

create index if not exists idx_store_leads_archived_by
  on public.store_leads(archived_by)
  where archived_by is not null;

create index if not exists idx_store_lead_conversions_actor
  on public.store_lead_conversions(actor_user_id, created_at desc)
  where actor_user_id is not null;

create index if not exists idx_store_lead_form_options_updated_by
  on public.store_lead_form_options(updated_by)
  where updated_by is not null;

commit;
