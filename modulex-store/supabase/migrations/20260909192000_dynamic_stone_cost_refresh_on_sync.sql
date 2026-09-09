begin;

-- Approved Dynamic Stone items remain linked across later catalog syncs. The
-- original approval trigger only listened to review/link changes, so correcting
-- vendor_price_reference after a resync left the canonical Cost price stale.
--
-- The generic vendor sync intentionally moves changed products back to PENDING.
-- Therefore a Dynamic Stone price refresh must key off OLD approval state: the
-- item was previously approved/linked, the canonical link is unchanged, and the
-- authenticated vendor price/currency changed during this sync.
drop trigger if exists trg_vendor_catalog_items_list_price_on_approval
  on public.vendor_catalog_items;

create trigger trg_vendor_catalog_items_list_price_on_approval
after update of
  review_status,
  canonical_product_id,
  vendor_price_reference,
  vendor_currency
on public.vendor_catalog_items
for each row
when (
  (
    new.review_status = 'APPROVED'
    and new.canonical_product_id is not null
    and (
      old.review_status is distinct from new.review_status
      or old.canonical_product_id is distinct from new.canonical_product_id
    )
  )
  or (
    old.review_status = 'APPROVED'
    and new.vendor_code = 'dynamicstone'
    and new.canonical_product_id is not null
    and old.canonical_product_id is not distinct from new.canonical_product_id
    and (
      old.vendor_price_reference is distinct from new.vendor_price_reference
      or old.vendor_currency is distinct from new.vendor_currency
    )
  )
)
execute function private.apply_vendor_list_price_on_approval();

commit;
