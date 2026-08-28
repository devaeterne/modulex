create policy store_lead_document_upload_tokens_no_client_access
on public.store_lead_document_upload_tokens
for all
to authenticated
using (false)
with check (false);
