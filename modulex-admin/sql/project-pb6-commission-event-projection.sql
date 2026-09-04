-- PB-6 bounded event history projection for lifecycle review and safe reversal selection.

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
  order by e.created_at desc, e.id desc;
$$;

revoke all on function public.get_customer_project_commission_events(uuid) from public;
grant execute on function public.get_customer_project_commission_events(uuid) to authenticated;
