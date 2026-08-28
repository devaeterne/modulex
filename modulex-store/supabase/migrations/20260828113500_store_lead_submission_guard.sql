create index if not exists idx_store_leads_email_created
on public.store_leads(lower(email), created_at desc);

create or replace function public.store_leads_public_submission_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    if (
      select count(*) >= 5
      from public.store_leads
      where lower(email) = lower(new.email)
        and created_at >= now() - interval '1 hour'
    ) then
      raise exception 'Too many recent submissions. Please try again later.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_store_leads_public_submission_guard
before insert on public.store_leads
for each row execute function public.store_leads_public_submission_guard();

update public.store_site_settings
set dealer_cta_href = '/dealers/apply',
    dealer_cta_label = 'Apply to Become a Dealer',
    updated_at = now()
where id = 1
  and dealer_cta_href = '/contact';
