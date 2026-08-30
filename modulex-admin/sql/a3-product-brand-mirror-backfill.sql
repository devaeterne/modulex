-- A3.1 production closeout: align legacy brand compatibility mirrors
-- with canonical product_brands references. brand_id remains authoritative.

update public.products p
set brand = pb.name
from public.product_brands pb
where p.brand_id = pb.id
  and p.brand is distinct from pb.name;
