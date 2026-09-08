-- PB-9 production-closeout performance hardening.
-- Cover the three profile actor FKs on the low-volume import batch table.
-- No import semantics, grants, RLS, RPCs, or business data change.

create index if not exists customer_project_import_batches_committed_by_idx
  on public.customer_project_import_batches (committed_by);

create index if not exists customer_project_import_batches_created_by_idx
  on public.customer_project_import_batches (created_by);

create index if not exists customer_project_import_batches_updated_by_idx
  on public.customer_project_import_batches (updated_by);
