\set ON_ERROR_STOP on
\pset pager off
\echo '=== Store Dealer document isolation smoke ==='
\echo 'All writes run inside one transaction and are rolled back.'

begin;
set local statement_timeout = '60s';

do $$
declare
  v_dealer_type uuid;
  v_customer_type uuid;
  v_dealer_a uuid;
  v_dealer_b uuid;
  v_customer_a uuid;
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_user_customer uuid := gen_random_uuid();
  v_visible_a uuid;
  v_hidden_a uuid;
  v_visible_b uuid;
  v_default_hidden uuid;
  v_suffix text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  v_email_a text;
  v_email_b text;
  v_email_customer text;
  v_result jsonb;
  v_policy text;
begin
  v_email_a := 'p15-doc-a-' || v_suffix || '@example.com';
  v_email_b := 'p15-doc-b-' || v_suffix || '@example.com';
  v_email_customer := 'p15-doc-c-' || v_suffix || '@example.com';

  select id into v_dealer_type from public.customer_types where system_key='dealer' and is_active=true limit 1;
  select id into v_customer_type from public.customer_types where system_key='retail_customer' and is_active=true limit 1;
  if v_dealer_type is null or v_customer_type is null then raise exception 'required customer types missing'; end if;

  insert into public.customers(customer_code,name,customer_type_id,status,portal_enabled)
  values ('P15-DOC-A-'||v_suffix,'P1.5 Document Dealer A',v_dealer_type,'active',true) returning id into v_dealer_a;
  insert into public.customers(customer_code,name,customer_type_id,status,portal_enabled)
  values ('P15-DOC-B-'||v_suffix,'P1.5 Document Dealer B',v_dealer_type,'active',true) returning id into v_dealer_b;
  insert into public.customers(customer_code,name,customer_type_id,status,portal_enabled)
  values ('P15-DOC-C-'||v_suffix,'P1.5 Document Customer',v_customer_type,'active',true) returning id into v_customer_a;

  insert into public.customer_portal_users(customer_id,login_email,status,is_primary)
  values (v_dealer_a,v_email_a,'never_invited',true),(v_dealer_b,v_email_b,'never_invited',true),(v_customer_a,v_email_customer,'never_invited',true);

  insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_anonymous)
  values
    (v_user_a,'authenticated','authenticated',v_email_a,'','{"provider":"email","providers":["email"],"account_type":"dealer_portal"}'::jsonb,'{}'::jsonb,now(),now(),false),
    (v_user_b,'authenticated','authenticated',v_email_b,'','{"provider":"email","providers":["email"],"account_type":"dealer_portal"}'::jsonb,'{}'::jsonb,now(),now(),false),
    (v_user_customer,'authenticated','authenticated',v_email_customer,'','{"provider":"email","providers":["email"],"account_type":"customer_portal"}'::jsonb,'{}'::jsonb,now(),now(),false);

  update public.customer_portal_users set auth_user_id=v_user_a,status='active',activated_at=now() where customer_id=v_dealer_a;
  update public.customer_portal_users set auth_user_id=v_user_b,status='active',activated_at=now() where customer_id=v_dealer_b;
  update public.customer_portal_users set auth_user_id=v_user_customer,status='active',activated_at=now() where customer_id=v_customer_a;

  insert into public.customer_documents(customer_id,document_type,file_name,storage_bucket,storage_path,mime_type,file_size_bytes,description,is_active,portal_visible)
  values (v_dealer_a,'spec','visible-a.pdf','customer-documents',v_dealer_a::text||'/visible-a.pdf','application/pdf',1200,'Visible A',true,true)
  returning id into v_visible_a;
  insert into public.customer_documents(customer_id,document_type,file_name,storage_bucket,storage_path,mime_type,file_size_bytes,description,is_active,portal_visible)
  values (v_dealer_a,'spec','hidden-a.pdf','customer-documents',v_dealer_a::text||'/hidden-a.pdf','application/pdf',1300,'Hidden A',true,false)
  returning id into v_hidden_a;
  insert into public.customer_documents(customer_id,document_type,file_name,storage_bucket,storage_path,mime_type,file_size_bytes,description,is_active,portal_visible)
  values (v_dealer_b,'spec','visible-b.pdf','customer-documents',v_dealer_b::text||'/visible-b.pdf','application/pdf',1400,'Visible B',true,true)
  returning id into v_visible_b;
  insert into public.customer_documents(customer_id,document_type,file_name,storage_bucket,storage_path,mime_type,file_size_bytes,description,is_active)
  values (v_dealer_a,'spec','default-hidden.pdf','customer-documents',v_dealer_a::text||'/default-hidden.pdf','application/pdf',1500,'Default Hidden',true)
  returning id into v_default_hidden;

  if (select portal_visible from public.customer_documents where id=v_default_hidden) is not false then
    raise exception 'customer_documents.portal_visible does not default false';
  end if;

  perform set_config('request.jwt.claim.sub',v_user_a::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  v_result := public.get_store_dealer_documents();
  if coalesce((v_result->>'ok')::boolean,false) is not true then raise exception 'Dealer document list denied: %',v_result; end if;
  if jsonb_array_length(v_result->'documents') <> 1 or (v_result->'documents'->0->>'id')::uuid <> v_visible_a then
    raise exception 'Dealer document list is not explicit/scoped: %',v_result;
  end if;
  if (v_result->'documents'->0) ? 'storage_path' or (v_result->'documents'->0) ? 'storage_bucket' then
    raise exception 'Dealer document list exposed storage metadata: %',v_result;
  end if;

  v_result := public.get_store_dealer_document(v_visible_a);
  if coalesce((v_result->>'ok')::boolean,false) is not true or v_result->'document'->>'storage_path' <> v_dealer_a::text||'/visible-a.pdf' then
    raise exception 'Dealer visible document authorization failed: %',v_result;
  end if;
  v_result := public.get_store_dealer_document(v_hidden_a);
  if coalesce((v_result->>'ok')::boolean,false) is true or v_result->>'reason' <> 'document_unavailable' then
    raise exception 'Hidden document did not fail neutrally: %',v_result;
  end if;
  v_result := public.get_store_dealer_document(v_visible_b);
  if coalesce((v_result->>'ok')::boolean,false) is true or v_result->>'reason' <> 'document_unavailable' then
    raise exception 'Foreign Dealer document did not fail neutrally: %',v_result;
  end if;

  perform set_config('request.jwt.claim.sub',v_user_customer::text,true);
  v_result := public.get_store_dealer_documents();
  if coalesce((v_result->>'ok')::boolean,false) is true then raise exception 'Customer portal accessed Dealer documents: %',v_result; end if;

  if has_function_privilege('anon','public.get_store_dealer_documents()','EXECUTE') then raise exception 'anon can execute Dealer document list'; end if;
  if has_function_privilege('anon','public.get_store_dealer_document(uuid)','EXECUTE') then raise exception 'anon can execute Dealer document detail'; end if;
  if has_function_privilege('anon','public.get_store_dealer_account()','EXECUTE') then raise exception 'anon can execute Dealer account'; end if;

  if not exists (select 1 from storage.buckets where id='customer-documents' and public=false) then
    raise exception 'customer-documents bucket is missing or public';
  end if;

  select string_agg(coalesce(qual,'')||' '||coalesce(with_check,''),' ') into v_policy
  from pg_policies
  where schemaname='storage' and tablename='objects' and policyname like 'customer_documents%';
  if coalesce(v_policy,'') not ilike '%portal_visible%' or coalesce(v_policy,'') not ilike '%customer_id%' or coalesce(v_policy,'') not ilike '%is_active%' then
    raise exception 'Storage Dealer policy is not tied to document visibility/customer/activity metadata: %',v_policy;
  end if;
end
$$;

rollback;
\echo '=== Store Dealer document isolation smoke PASS ==='
