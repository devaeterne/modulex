# Store Lead Notifications

This package connects Store website inquiries and dealer applications to the existing Modulex Admin notification infrastructure.

## Event

`new_store_lead`

A single internal notification event is queued after a `store_leads` row is created. The event key is deterministic (`new_store_lead:<lead-id>`) so duplicate enqueue attempts are ignored by the existing notification queue contract.

## Delivery

- Panel: Admin, Super Admin, and Sales can see Store lead notifications according to the existing `leads.view` permission model.
- Email: recipients are configured separately through General Settings using `lead_notification_emails`.
- Sound: enabled by default through `notification_delivery_rules` and remains configurable in the existing notification-delivery settings UI.

Panel notifications link directly to `/store/leads/<id>`.

## Email content

The internal email renderer reads the protected Store lead record server-side and includes operational contact/application details needed for follow-up. It does not expose the lead through a public RPC or public table read.

## Database

Production migration: `store_lead_notifications`

The migration:

1. adds `general_settings.lead_notification_emails`
2. allows `store_lead` in the existing email notification queue entity contract
3. adds the `new_store_lead` delivery rule
4. installs a private `AFTER INSERT` trigger on `store_leads`
5. extends the panel feed projection for Store lead references and Admin/Sales visibility

The trigger helper is private and execute privileges are revoked from `public`, `anon`, and `authenticated`.

## Verification

A production transaction smoke test inserted a disposable dealer application, asserted that exactly one matching `new_store_lead` queue event was generated, and rolled the transaction back. After rollback, both Store lead and Store lead notification row counts remained zero.

No Vercel deployment is part of this package.
