revoke all on public.store_media_assets from authenticated;
revoke all on public.store_media_asset_sources from authenticated;

revoke all on public.store_media_assets from anon;
revoke all on public.store_media_asset_sources from anon;

grant select, insert, update, delete on public.store_media_assets to authenticated;
grant select, insert, update, delete on public.store_media_asset_sources to authenticated;
