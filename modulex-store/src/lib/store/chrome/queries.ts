import { callPublicRpc } from "@/lib/supabase/public-rest";
import type {
  StoreChromeDestinationKey,
  StoreChromeItem,
  StoreChromePlacement,
} from "@/lib/store/chrome/destinations";

type StoreChromeItemRpc = {
  id: string;
  placement: StoreChromePlacement;
  destination_key: StoreChromeDestinationKey;
  label: string;
  sort_order: number;
};

function mapStoreChromeItem(row: StoreChromeItemRpc): StoreChromeItem {
  return {
    id: row.id,
    placement: row.placement,
    destinationKey: row.destination_key,
    label: row.label,
    sortOrder: row.sort_order,
  };
}

export async function getStorePublicChromeItems(): Promise<StoreChromeItem[]> {
  const rows = await callPublicRpc<StoreChromeItemRpc[]>(
    "get_store_public_chrome_items",
    {},
    { revalidate: 60 },
  );

  return rows.map(mapStoreChromeItem);
}
