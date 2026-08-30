import { supabase } from "@/lib/supabase/client";

export const STORE_CHROME_PLACEMENTS = [
  { value: "primary_nav", label: "Primary navigation" },
  { value: "footer_products", label: "Footer — Products" },
  { value: "footer_company", label: "Footer — Company" },
] as const;

export const STORE_CHROME_DESTINATIONS = [
  { key: "home", label: "Home", href: "/" },
  { key: "about", label: "About", href: "/about" },
  { key: "products", label: "Products", href: "/products" },
  { key: "showroom", label: "Showroom", href: "/showroom" },
  { key: "cabinet_process", label: "Cabinet Planning", href: "/cabinet-process" },
  { key: "gallery", label: "Gallery", href: "/gallery" },
  { key: "contact", label: "Contact", href: "/contact" },
  { key: "dealer_apply", label: "Dealer Application", href: "/dealers/apply" },
] as const;

export type StoreChromePlacement = (typeof STORE_CHROME_PLACEMENTS)[number]["value"];
export type StoreChromeDestinationKey = (typeof STORE_CHROME_DESTINATIONS)[number]["key"];
export type StoreChromeStatus = "draft" | "published";

export type StoreChromeItem = {
  id: string;
  placement: StoreChromePlacement;
  destinationKey: StoreChromeDestinationKey;
  label: string;
  sortOrder: number;
  status: StoreChromeStatus;
  publishedAt: string | null;
  updatedAt: string;
};

export type StoreChromeItemInput = Pick<
  StoreChromeItem,
  "placement" | "destinationKey" | "label" | "sortOrder"
>;

type StoreChromeRow = {
  id: string;
  placement: StoreChromePlacement;
  destination_key: StoreChromeDestinationKey;
  label: string;
  sort_order: number;
  status: StoreChromeStatus;
  published_at: string | null;
  updated_at: string;
};

const destinationKeys = new Set<string>(STORE_CHROME_DESTINATIONS.map((item) => item.key));
const placementKeys = new Set<string>(STORE_CHROME_PLACEMENTS.map((item) => item.value));

function mapStoreChromeItem(row: StoreChromeRow): StoreChromeItem {
  return {
    id: row.id,
    placement: row.placement,
    destinationKey: row.destination_key,
    label: row.label,
    sortOrder: row.sort_order,
    status: row.status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

export function validateStoreChromeItem(input: StoreChromeItemInput) {
  if (!placementKeys.has(input.placement)) return "Unsupported Store chrome placement.";
  if (!destinationKeys.has(input.destinationKey)) return "Unsupported Store destination.";
  if (!input.label.trim()) return "Link label is required.";
  if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0) {
    return "Sort order must be a whole number zero or greater.";
  }
  return null;
}

export function storeChromeDestinationLabel(key: StoreChromeDestinationKey) {
  return STORE_CHROME_DESTINATIONS.find((item) => item.key === key)?.label ?? key;
}

export function storeChromeDestinationHref(key: StoreChromeDestinationKey) {
  return STORE_CHROME_DESTINATIONS.find((item) => item.key === key)?.href ?? null;
}

export async function loadStoreChromeItems(): Promise<StoreChromeItem[]> {
  const { data, error } = await supabase
    .from("store_chrome_items")
    .select("id,placement,destination_key,label,sort_order,status,published_at,updated_at")
    .order("placement", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as StoreChromeRow[]).map(mapStoreChromeItem);
}

export async function saveStoreChromeItem(
  id: string,
  input: StoreChromeItemInput,
  status: StoreChromeStatus,
) {
  const validationError = validateStoreChromeItem(input);
  if (validationError) throw new Error(validationError);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw userError ?? new Error("Unable to verify current user.");

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("store_chrome_items")
    .update({
      placement: input.placement,
      destination_key: input.destinationKey,
      label: input.label.trim(),
      sort_order: input.sortOrder,
      status,
      published_at: status === "published" ? now : null,
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", id);

  if (error) throw error;
}
