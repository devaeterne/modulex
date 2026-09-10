-- Close Supabase Performance Advisor findings introduced by Project / Order documents.
-- Keep canonical lifecycle checks init-plan friendly and cover profile foreign keys.

begin;

create index if not exists entity_documents_uploaded_by_idx
  on public.entity_documents (uploaded_by)
  where uploaded_by is not null;

create index if not exists entity_documents_deactivated_by_idx
  on public.entity_documents (deactivated_by)
  where deactivated_by is not null;

drop policy if exists entity_documents_canonical_insert on public.entity_documents;
create policy entity_documents_canonical_insert
on public.entity_documents
for insert
to authenticated
with check (
  (select private.is_entity_document_mutator())
  and coalesce((select current_setting('modulex.entity_document_lifecycle', true)), '') = 'on'
);

drop policy if exists entity_documents_canonical_update on public.entity_documents;
create policy entity_documents_canonical_update
on public.entity_documents
for update
to authenticated
using (
  (select private.is_entity_document_mutator())
  and coalesce((select current_setting('modulex.entity_document_lifecycle', true)), '') = 'on'
)
with check (
  (select private.is_entity_document_mutator())
  and coalesce((select current_setting('modulex.entity_document_lifecycle', true)), '') = 'on'
);

notify pgrst, 'reload schema';

commit;
