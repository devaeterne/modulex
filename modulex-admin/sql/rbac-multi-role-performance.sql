-- Cover the audit foreign key used by multi-role assignments.
create index if not exists user_roles_assigned_by_idx
  on public.user_roles(assigned_by);
