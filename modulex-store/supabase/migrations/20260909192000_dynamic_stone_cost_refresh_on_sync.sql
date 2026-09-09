begin;

-- Approved Dynamic Stone items remain linked across later catalog syncs. The
-- original approval trigger only listened to review/link changes, so correcting
-- vendor_price_reference after a resync left the canonical Cost price stale.
--
-- Preserve the existing approval/link behavior for every vendor, and additionally
-- refresh pricing on vendor price/currency changes only for Dynamic Stone.
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
  new.review_status = 'APPROVED'
  and new.canonical_product_id is not null
  and (
    old.review_status is distinct from new.review_status
    or old.canonical_product_id is distinct from new.canonical_product_id
    or (
      new.vendor_code = 'dynamicstone'
      and (
        old.vendor_price_reference is distinct from new.vendor_price_reference
        or old.vendor_currency is distinct from new.vendor_currency
      )
    )
  )
)
execute function private.apply_vendor_list_price_on_approval();

commit;
