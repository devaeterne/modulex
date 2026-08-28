insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dealer-supporting-documents','dealer-supporting-documents',false,10485760,array['application/pdf','image/jpeg','image/png']::text[])
on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create table public.store_lead_document_upload_tokens (
  lead_id uuid primary key references public.store_leads(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  upload_count smallint not null default 0 check (upload_count between 0 and 4),
  max_uploads smallint not null default 4 check (max_uploads between 1 and 4),
  created_at timestamptz not null default now(),
  last_upload_at timestamptz,
  constraint store_lead_document_upload_token_hash check (token_hash ~ '^[0-9a-f]{64}$')
);
create index idx_store_lead_document_upload_tokens_expires on public.store_lead_document_upload_tokens(expires_at);

create table public.store_lead_documents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.store_leads(id) on delete cascade,
  document_type text not null check (document_type in ('business_license','resale_certificate','showroom_company_documentation','other')),
  storage_path text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 180),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);
create index idx_store_lead_documents_lead_created on public.store_lead_documents(lead_id, created_at desc);

alter table public.store_lead_document_upload_tokens enable row level security;
alter table public.store_lead_documents enable row level security;
revoke all on public.store_lead_document_upload_tokens from public, anon, authenticated;
revoke all on public.store_lead_documents from public, anon;
grant select on public.store_lead_documents to authenticated;
grant select, update on public.store_lead_document_upload_tokens to service_role;
grant select, insert on public.store_lead_documents to service_role;

create policy store_lead_documents_staff_select on public.store_lead_documents for select to authenticated
using (public.current_user_has_any_role(array['super_admin','admin','sales']::text[]));
create policy dealer_supporting_documents_staff_read on storage.objects for select to authenticated
using (bucket_id='dealer-supporting-documents' and public.current_user_has_any_role(array['super_admin','admin','sales']::text[]));

create or replace function public.store_lead_documents_validate_dealer()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if not exists (select 1 from public.store_leads where id=new.lead_id and lead_type='dealer_application') then
    raise exception 'Supporting documents may only be attached to dealer applications';
  end if;
  if new.storage_path not like new.lead_id::text || '/%' then raise exception 'Invalid supporting document storage path'; end if;
  return new;
end;
$$;
create trigger trg_store_lead_documents_validate_dealer before insert or update on public.store_lead_documents for each row execute function public.store_lead_documents_validate_dealer();

create or replace function public.store_lead_documents_log_activity()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.store_lead_activity(lead_id, action, note, actor_user_id) values (new.lead_id,'document_uploaded',new.document_type,null);
  return new;
end;
$$;
create trigger trg_store_lead_documents_activity after insert on public.store_lead_documents for each row execute function public.store_lead_documents_log_activity();
revoke all on function public.store_lead_documents_validate_dealer() from public, anon, authenticated;
revoke all on function public.store_lead_documents_log_activity() from public, anon, authenticated;

create or replace function public.claim_store_lead_document_upload(p_token_hash text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_lead_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid upload token'; end if;
  update public.store_lead_document_upload_tokens t
  set upload_count=t.upload_count+1,last_upload_at=now()
  where t.token_hash=p_token_hash and t.expires_at>now() and t.upload_count<t.max_uploads
    and exists(select 1 from public.store_leads l where l.id=t.lead_id and l.lead_type='dealer_application')
  returning t.lead_id into v_lead_id;
  if v_lead_id is null then raise exception 'Upload token is invalid or expired'; end if;
  return v_lead_id;
end;
$$;
revoke all on function public.claim_store_lead_document_upload(text) from public, anon, authenticated;
grant execute on function public.claim_store_lead_document_upload(text) to service_role;

create or replace function public.submit_store_lead(p_payload jsonb)
returns table(id uuid, reference_code text)
language plpgsql security definer set search_path=public as $$
declare
  v_type text := lower(trim(coalesce(p_payload->>'lead_type','contact')));
  v_first text := trim(coalesce(p_payload->>'first_name',''));
  v_last text := trim(coalesce(p_payload->>'last_name',''));
  v_email text := lower(trim(coalesce(p_payload->>'email','')));
  v_country text := upper(trim(coalesce(p_payload->>'country_code','')));
  v_privacy boolean := coalesce((p_payload->>'privacy_accepted')::boolean,false);
  v_document_token text := lower(trim(coalesce(p_payload->>'document_upload_token','')));
  v_id uuid; v_ref text;
begin
  if coalesce(trim(p_payload->>'website_hp'),'') <> '' then raise exception 'Unable to submit request'; end if;
  if v_type not in ('contact','dealer_application') then raise exception 'Invalid request type'; end if;
  if char_length(v_first)<1 or char_length(v_first)>120 or char_length(v_last)<1 or char_length(v_last)>120 then raise exception 'First and last name are required'; end if;
  if char_length(v_email)<3 or char_length(v_email)>320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Valid email is required'; end if;
  if not v_privacy then raise exception 'Privacy acknowledgement is required'; end if;
  if v_country<>'' and v_country !~ '^[A-Z]{2}$' then raise exception 'Country code must be two letters'; end if;
  if v_type='dealer_application' and coalesce(trim(p_payload->>'company_name'),'')='' then raise exception 'Company name is required for dealer applications'; end if;
  if char_length(coalesce(p_payload->>'message',''))>5000 then raise exception 'Message is too long'; end if;
  if v_document_token<>'' and (v_type<>'dealer_application' or v_document_token !~ '^[0-9a-f]{64}$') then raise exception 'Invalid supporting document upload request'; end if;

  insert into public.store_leads (lead_type,first_name,last_name,email,phone,company_name,company_website,country_code,city,address,business_type,has_showroom,sales_channels,estimated_annual_volume,product_interests,message,marketing_consent,privacy_accepted,source,utm_source,utm_medium,utm_campaign,utm_content,utm_term,landing_page,referrer,updated_by)
  values (v_type,v_first,v_last,v_email,nullif(left(trim(coalesce(p_payload->>'phone','')),80),''),nullif(left(trim(coalesce(p_payload->>'company_name','')),200),''),nullif(left(trim(coalesce(p_payload->>'company_website','')),500),''),nullif(v_country,''),nullif(left(trim(coalesce(p_payload->>'city','')),160),''),nullif(left(trim(coalesce(p_payload->>'address','')),500),''),nullif(left(trim(coalesce(p_payload->>'business_type','')),160),''),case when p_payload ? 'has_showroom' then (p_payload->>'has_showroom')::boolean else null end,coalesce(array(select left(value,120) from jsonb_array_elements_text(coalesce(p_payload->'sales_channels','[]'::jsonb)) value limit 20),'{}'),nullif(left(trim(coalesce(p_payload->>'estimated_annual_volume','')),160),''),coalesce(array(select left(value,120) from jsonb_array_elements_text(coalesce(p_payload->'product_interests','[]'::jsonb)) value limit 30),'{}'),nullif(trim(coalesce(p_payload->>'message','')),''),coalesce((p_payload->>'marketing_consent')::boolean,false),true,coalesce(nullif(left(trim(coalesce(p_payload->>'source','')),80),''),'website'),nullif(left(trim(coalesce(p_payload->>'utm_source','')),255),''),nullif(left(trim(coalesce(p_payload->>'utm_medium','')),255),''),nullif(left(trim(coalesce(p_payload->>'utm_campaign','')),255),''),nullif(left(trim(coalesce(p_payload->>'utm_content','')),255),''),nullif(left(trim(coalesce(p_payload->>'utm_term','')),255),''),nullif(left(trim(coalesce(p_payload->>'landing_page','')),1000),''),nullif(left(trim(coalesce(p_payload->>'referrer','')),1000),''),null)
  returning store_leads.id, store_leads.reference_code into v_id,v_ref;
  if v_document_token<>'' then insert into public.store_lead_document_upload_tokens(lead_id,token_hash) values(v_id,encode(extensions.digest(v_document_token,'sha256'),'hex')); end if;
  return query select v_id,v_ref;
end;
$$;
revoke all on function public.submit_store_lead(jsonb) from public;
grant execute on function public.submit_store_lead(jsonb) to anon, authenticated;
