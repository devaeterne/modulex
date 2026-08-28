create index if not exists idx_store_leads_reviewed_by
on public.store_leads(reviewed_by)
where reviewed_by is not null;

create index if not exists idx_store_leads_updated_by
on public.store_leads(updated_by)
where updated_by is not null;
