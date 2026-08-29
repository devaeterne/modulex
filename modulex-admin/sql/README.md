# Admin SQL bootstrap order

Until the project is moved to Supabase CLI migrations under `supabase/migrations`, apply the admin SQL files in this order on a fresh database:

1. `general-settings.sql`
2. `customer-master-mutation.sql`
3. `customer-address-integrity.sql`
4. `customer-orders.sql`
5. `customer-order-list-summary.sql`
6. `customer-order-payments.sql`
7. `customer-order-payment-override.sql`
8. `customer-order-editing.sql`
9. `customer-invoices.sql`
10. `customer-invoice-payment-terms.sql`
11. `customer-shipments.sql`
12. `customer-installations.sql`
13. `performance-rls.sql`

`customer-master-mutation.sql` hardens the existing customer master tables with validated status/type mutations and atomic audit logging. It assumes the base `customers`, `customer_types`, `customer_activity`, `profiles`, and role-helper objects already exist.

`customer-address-integrity.sql` adds SECURITY INVOKER address RPCs that serialize per customer and keep default clearing, assignment/creation, and customer activity in one transaction while preserving existing RLS.

`customer-order-list-summary.sql` adds the `security_invoker=true` `customer_order_directory` view used for joined order/customer search with exact server-side count and pagination, plus the SECURITY INVOKER aggregate used by global and customer-scoped summary cards. Both surfaces preserve the existing `customers` / `customer_orders` RLS boundary; the summary returns a monetary total only when the selected scope has one currency.

`performance-rls.sql` is a query-planning hardening step. It preserves the existing RLS role rules while converting known stable role/permission helper predicates to one-time statement checks. Apply it after all schema files that create those policies. Existing environments can apply it once as the final performance migration.

After applying schema changes, reload the PostgREST schema cache when required:

```sql
NOTIFY pgrst, 'reload schema';
```

## Existing-environment compatibility fixes

`customer-order-update-overload-fix.sql` repairs an ambiguity that can exist when both the legacy 14-argument private order-update core and the newer fulfillment-aware 15-argument private wrapper are installed. The public 15-argument RPC keeps its defaults; the private wrapper requires all 15 arguments so 14-argument internal delegation resolves uniquely to the legacy core.

Apply this compatibility fix only to an existing environment that already has the fulfillment-aware 15-argument private wrapper. Afterward, run the Admin `npm run smoke` suite; the order update/revision/reservation section must pass before the environment is considered verified.

## Historical runtime fixes

Do not apply old runtime-fix SQL files to a fresh database. Their corrections must be folded into the canonical migration file instead. In particular, the shipment `stock_out` signature and `public.locations` references are already part of `customer-shipments.sql`.

## Next migration step

The long-term target is to replace this manually ordered folder with Supabase CLI migrations in `supabase/migrations` and use `supabase db push`. Until that conversion is performed as a dedicated migration task, keep this order authoritative and avoid ad-hoc SQL execution on fresh environments.
