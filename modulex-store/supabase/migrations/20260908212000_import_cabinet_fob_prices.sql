-- Import verified cabinet FOB unit prices from Sanyang Proforma Invoice GCL-1 (2026-05-23).
-- Source mapping: Shaker White=WH, Light Brown Stained=NT, Navy Blue=NB.
-- Only CABINETS products in these three colors are targeted.

create temporary table cabinet_fob_import (
  base_sku text primary key,
  wh_amount numeric(18,4) not null,
  nt_amount numeric(18,4) not null,
  nb_amount numeric(18,4) not null
) on commit drop;

insert into cabinet_fob_import (base_sku, wh_amount, nt_amount, nb_amount)
values
  ('W3012', 28.50, 29.36, 29.36),
  ('W3612', 32.24, 33.21, 33.21),
  ('W1215', 16.62, 17.12, 17.12),
  ('W1515', 18.69, 19.25, 19.25),
  ('W1815', 20.76, 21.38, 21.38),
  ('W2115', 22.83, 23.51, 23.51),
  ('W2415', 27.69, 28.52, 28.52),
  ('W2715', 29.75, 30.65, 30.65),
  ('W361224', 42.37, 43.64, 43.64),
  ('W3015', 31.82, 32.78, 32.78),
  ('W3315', 33.89, 34.91, 34.91),
  ('W3615', 35.96, 37.04, 37.04),
  ('W3018', 35.14, 36.19, 36.19),
  ('W3318', 37.41, 38.53, 38.53),
  ('W3618', 39.68, 40.87, 40.87),
  ('W361824', 50.14, 51.65, 51.65),
  ('W3024', 44.81, 46.15, 46.15),
  ('W3324', 47.78, 49.21, 49.21),
  ('W3624', 50.75, 52.27, 52.27),
  ('W362424', 65.48, 67.44, 67.44),
  ('W0930', 25.01, 25.76, 25.76),
  ('W1230', 28.33, 29.18, 29.18),
  ('W1530', 32.00, 32.96, 32.96),
  ('W1530GD', 33.80, 34.81, 34.81),
  ('W1830', 35.67, 36.74, 36.74),
  ('W1830GD', 37.72, 38.85, 38.85),
  ('W2130', 39.34, 40.52, 40.52),
  ('W2430', 47.09, 48.51, 48.51),
  ('W2430GD', 49.86, 51.36, 51.36),
  ('W2730', 50.76, 52.29, 52.29),
  ('W3030', 54.43, 56.07, 56.07),
  ('W3330', 58.10, 59.85, 59.85),
  ('W3630', 61.77, 63.63, 63.63),
  ('W0936', 28.38, 29.23, 29.23),
  ('W1236', 32.04, 33.01, 33.01),
  ('W1536', 36.11, 37.20, 37.20),
  ('W1536GD', 38.16, 39.31, 39.31),
  ('W1836', 40.19, 41.39, 41.39),
  ('W1836GD', 42.51, 43.79, 43.79),
  ('W2136', 44.26, 45.59, 45.59),
  ('W2436', 52.93, 54.52, 54.52),
  ('W2436GD', 56.07, 57.75, 57.75),
  ('W2736', 57.00, 58.71, 58.71),
  ('W3036', 61.07, 62.90, 62.90),
  ('W3336', 65.14, 67.10, 67.10),
  ('W3636', 69.21, 71.29, 71.29),
  ('W0942', 33.61, 34.62, 34.62),
  ('W1242', 37.92, 39.06, 39.06),
  ('W1542', 42.69, 43.97, 43.97),
  ('W1542GD', 45.12, 46.48, 46.48),
  ('W1842', 47.47, 48.89, 48.89),
  ('W1842GD', 50.23, 51.74, 51.74),
  ('W2142', 52.24, 53.81, 53.81),
  ('W2442', 63.07, 64.96, 64.96),
  ('W2442GD', 66.81, 68.81, 68.81),
  ('W2742', 67.84, 69.88, 69.88),
  ('W3042', 72.62, 74.80, 74.80),
  ('W3342', 77.39, 79.71, 79.71),
  ('W3642', 82.16, 84.63, 84.63),
  ('DCW2430', 58.93, 60.70, 60.70),
  ('DCW2436', 65.23, 67.19, 67.19),
  ('DCW2442', 78.12, 80.46, 80.46),
  ('DCW2430GD', 62.75, 64.63, 64.63),
  ('DCW2436GD', 69.49, 71.57, 71.57),
  ('DCW2442GD', 83.32, 85.82, 85.82),
  ('AW1236', 31.58, 32.53, 32.53),
  ('AW1242', 37.31, 38.43, 38.43),
  ('BT9', 32.89, 33.87, 33.87),
  ('B12', 49.69, 51.18, 51.18),
  ('B15', 54.04, 55.67, 55.67),
  ('B18', 58.40, 60.15, 60.15),
  ('B21', 62.75, 64.63, 64.63),
  ('B24', 70.38, 72.49, 72.49),
  ('B27', 75.10, 77.36, 77.36),
  ('B30', 91.46, 94.20, 94.20),
  ('B33', 96.20, 99.08, 99.08),
  ('B36', 100.94, 103.97, 103.97),
  ('SB24', 51.05, 52.58, 52.58),
  ('SB27', 54.55, 56.19, 56.19),
  ('SB30', 58.79, 60.55, 60.55),
  ('SB33', 62.29, 64.16, 64.16),
  ('SB36', 65.79, 67.76, 67.76),
  ('MB27', 68.35, 70.41, 70.41),
  ('3DB12', 78.02, 80.36, 80.36),
  ('3DB15', 84.57, 87.11, 87.11),
  ('3DB18', 91.13, 93.87, 93.87),
  ('3DB21', 97.69, 100.62, 100.62),
  ('3DB24', 104.34, 107.47, 107.47),
  ('3DB27', 111.33, 114.67, 114.67),
  ('3DB30', 118.32, 121.87, 121.87),
  ('2DB30', 108.83, 112.10, 112.10),
  ('3DB33', 125.31, 129.07, 129.07),
  ('3DB36', 132.31, 136.27, 136.27),
  ('CSB36', 63.62, 65.53, 65.53),
  ('LSB33-W', 111.03, 114.36, 114.36),
  ('LSB36-W', 118.83, 122.40, 122.40),
  ('BEC24', 66.96, 68.97, 68.97),
  ('BBC36', 72.43, 74.61, 74.61),
  ('BBC42', 77.18, 79.49, 79.49),
  ('BDEP', 16.69, 17.19, 17.19),
  ('BCM8', 21.45, 22.10, 22.10),
  ('BAM', 4.06, 4.19, 4.19),
  ('BWB21', 81.51, 83.95, 83.95),
  ('BWB18', 76.36, 78.66, 78.66),
  ('bwb15', 71.22, 73.36, 73.36),
  ('SPB6', 51.23, 52.77, 52.77),
  ('SPB9', 59.59, 61.37, 61.37),
  ('U188424', 118.14, 121.68, 121.68),
  ('U189024', 123.87, 127.59, 127.59),
  ('U189624', 130.54, 134.46, 134.46),
  ('U248424', 149.78, 154.27, 154.27),
  ('U249024', 156.72, 161.42, 161.42),
  ('U249624', 165.53, 170.50, 170.50),
  ('U308424', 172.45, 177.63, 177.63),
  ('U309024', 180.20, 185.60, 185.60),
  ('U309624', 189.82, 195.51, 195.51),
  ('O338424', 224.49, 231.23, 231.23),
  ('O339024', 239.34, 246.52, 246.52),
  ('O339624', 247.48, 254.91, 254.91),
  ('VS24', 49.02, 50.49, 50.49),
  ('VS30', 56.63, 58.33, 58.33),
  ('VS36', 63.50, 65.41, 65.41),
  ('3VDB12', 72.33, 74.50, 74.50),
  ('3VDB15', 78.67, 81.03, 81.03),
  ('3VDB18', 85.02, 87.57, 87.57),
  ('V3021DL', 96.09, 98.97, 98.97),
  ('V3021DR', 96.09, 98.97, 98.97),
  ('V3621DL', 106.00, 109.18, 109.18),
  ('V3621DR', 106.00, 109.18, 109.18),
  ('VKD36', 29.11, 29.99, 29.99),
  ('TKC', 3.01, 3.10, 3.10),
  ('S2496', 29.22, 30.10, 30.10),
  ('DWR3', 16.82, 17.33, 17.33),
  ('WDEP30', 8.18, 8.42, 8.42),
  ('WDEP36', 9.68, 9.97, 9.97),
  ('WDEP42', 11.35, 11.69, 11.69),
  ('F342', 4.60, 4.73, 4.73),
  ('F642', 9.13, 9.40, 9.40),
  ('F396', 14.82, 15.26, 15.26),
  ('F696', 23.35, 24.05, 24.05),
  ('RS18', 13.86, 14.27, 14.27),
  ('RS21', 14.88, 15.33, 15.33),
  ('RS24', 15.92, 16.40, 16.40),
  ('RS27', 16.95, 17.46, 17.46),
  ('RS30', 17.98, 18.51, 18.51),
  ('RS33', 19.00, 19.57, 19.57),
  ('RS36', 20.03, 20.63, 20.63),
  ('Shoe-Molding', 3.13, 3.22, 3.22),
  ('Furniture-Base', 20.06, 20.67, 20.67),
  ('SMB', 3.17, 3.26, 3.26),
  ('OCM8', 3.67, 3.78, 3.78),
  ('CM8', 17.01, 17.52, 17.52),
  ('COV', 26.68, 27.48, 27.48),
  ('FPV4896', 29.41, 30.29, 30.29);

do $$
declare
  v_fob_group_id uuid;
  v_group_count integer;
  v_target_count integer;
  v_price_count integer;
begin
  select count(*)
    into v_group_count
  from public.price_groups
  where lower(btrim(name)) = 'fob';

  if v_group_count <> 1 then
    raise exception 'Expected exactly one FOB price group, found %', v_group_count;
  end if;

  select id
    into v_fob_group_id
  from public.price_groups
  where lower(btrim(name)) = 'fob'
  limit 1;

  update public.price_groups
  set internal_only = true,
      available_for_orders = false
  where id = v_fob_group_id
    and (
      internal_only is distinct from true
      or available_for_orders is distinct from false
    );

  select count(*)
    into v_target_count
  from public.products p
  join public.product_types pt on pt.id = p.product_type_id
  join cabinet_fob_import src
    on p.sku = p.color_code || '-' || src.base_sku
  where pt.code = 'CABINETS'
    and p.color_code in ('WH', 'NT', 'NB');

  if v_target_count <> 462 then
    raise exception 'Cabinet FOB import expected 462 matched products, found %', v_target_count;
  end if;

  insert into public.product_prices (
    product_id,
    price_group_id,
    amount,
    currency_code,
    valid_from,
    valid_to,
    is_active
  )
  select
    p.id,
    v_fob_group_id,
    case p.color_code
      when 'WH' then src.wh_amount
      when 'NT' then src.nt_amount
      when 'NB' then src.nb_amount
    end,
    'USD',
    now(),
    null,
    true
  from public.products p
  join public.product_types pt on pt.id = p.product_type_id
  join cabinet_fob_import src
    on p.sku = p.color_code || '-' || src.base_sku
  where pt.code = 'CABINETS'
    and p.color_code in ('WH', 'NT', 'NB')
  on conflict (product_id, price_group_id, currency_code)
    where is_active = true and valid_to is null
  do update
    set amount = excluded.amount;

  select count(*)
    into v_price_count
  from public.product_prices pp
  join public.products p on p.id = pp.product_id
  join public.product_types pt on pt.id = p.product_type_id
  join cabinet_fob_import src
    on p.sku = p.color_code || '-' || src.base_sku
  where pp.price_group_id = v_fob_group_id
    and pp.currency_code = 'USD'
    and pp.is_active = true
    and pp.valid_to is null
    and pt.code = 'CABINETS'
    and p.color_code in ('WH', 'NT', 'NB')
    and pp.amount = case p.color_code
      when 'WH' then src.wh_amount
      when 'NT' then src.nt_amount
      when 'NB' then src.nb_amount
    end;

  if v_price_count <> 462 then
    raise exception 'Cabinet FOB verification expected 462 exact current prices, found %', v_price_count;
  end if;
end;
$$;
