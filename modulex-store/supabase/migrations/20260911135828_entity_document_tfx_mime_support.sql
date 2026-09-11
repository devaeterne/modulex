-- Add the registered TIFF-FX MIME type to the existing private Project/Order
-- document bucket without widening visibility or changing the 25 MiB limit.

update storage.buckets
set allowed_mime_types = case
  when coalesce(allowed_mime_types, '{}'::text[]) @> array['image/tiff-fx']::text[]
    then allowed_mime_types
  else coalesce(allowed_mime_types, '{}'::text[]) || array['image/tiff-fx']::text[]
end
where id = 'entity-documents';
