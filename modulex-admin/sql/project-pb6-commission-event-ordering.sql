-- PB-6 production-closeout hardening: deterministic append order for commission events.
-- PostgreSQL now() is transaction-scoped, so multiple events appended in one transaction
-- can share created_at. A database-assigned identity sequence provides a stable append order
-- without rewriting or deleting immutable commission history.

alter table public.project_commission_events
  add column if not exists event_sequence bigint generated always as identity;

create unique index if not exists project_commission_events_event_sequence_uq
  on public.project_commission_events(event_sequence);

create index if not exists project_commission_events_obligation_sequence_idx
  on public.project_commission_events(obligation_id, event_sequence desc);

create or replace function private.current_project_commission_status(p_obligation_id uuid)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(
    (
      select e.status_after
      from public.project_commission_events e
      where e.obligation_id = p_obligation_id
      order by e.event_sequence desc
      limit 1
    ),
    'pending'
  );
$$;

create or replace function public.get_customer_project_commission_events(p_obligation_id uuid)
returns table(
  event_id uuid,
  event_type text,
  status_after text,
  amount_delta numeric,
  reason text,
  reverses_event_id uuid,
  is_reversed boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    e.id,
    e.event_type,
    e.status_after,
    e.amount_delta,
    e.reason,
    e.reverses_event_id,
    exists (
      select 1
      from public.project_commission_events reversal
      where reversal.reverses_event_id = e.id
    ),
    e.created_at
  from public.project_commission_events e
  join public.project_commission_obligations o on o.id = e.obligation_id
  where e.obligation_id = p_obligation_id
    and private.can_view_project_commission(o.project_id, o.participant_id)
  order by e.event_sequence desc;
$$;

revoke all on function private.current_project_commission_status(uuid) from public;
revoke all on function public.get_customer_project_commission_events(uuid) from public;
grant execute on function public.get_customer_project_commission_events(uuid) to authenticated;
