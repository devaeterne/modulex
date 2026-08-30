create or replace function public.get_store_public_testimonials()
returns table (
  id uuid,
  reviewer_name text,
  reviewer_location text,
  excerpt text,
  sort_order integer,
  attribution_classification text,
  source_entity text,
  source_page_url text,
  attribution_text text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    t.reviewer_name,
    t.reviewer_location,
    t.excerpt,
    t.sort_order,
    t.attribution_classification,
    t.source_entity,
    t.source_page_url,
    t.attribution_text,
    t.updated_at
  from public.store_testimonials t
  where t.status = 'published'
    and (
      t.attribution_classification = 'oakwell_owned'
      or (
        t.attribution_classification = 'parent_attributed'
        and length(trim(coalesce(t.source_entity, ''))) > 0
        and t.source_page_url ~ '^https://'
        and length(trim(coalesce(t.attribution_text, ''))) > 0
      )
    )
  order by t.sort_order asc, t.created_at asc;
$$;

revoke all on function public.get_store_public_testimonials() from public;
grant execute on function public.get_store_public_testimonials() to anon, authenticated;
