-- Modulex Admin notification routing v2 email guard
-- The existing shared email processor resolves approval_requested through the generic
-- order notification mailbox, not through approvals.review recipients. Until targeted
-- approval-email delivery is implemented, fail closed instead of sending an approval
-- request to an unrelated configured mailbox. Panel + sound delivery remain enabled and
-- permission-aware through NOTIFICATION_ROUTING_V2.sql.

update public.notification_delivery_rules
set internal_email_enabled = false,
    updated_at = now()
where event_type = 'approval_requested'
  and internal_email_enabled is distinct from false;
