"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import ProductImageThumbnail from "@/components/common/ProductImageThumbnail";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import { Modal } from "@/components/ui/modal";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";

type Option = { value: string; label: string };
type BrandRow = { id: string; name: string };
type StoneTypeRow = { id: string; name: string };
type BandRow = { id: string; code: string; price_per_sqft: string | number };
type PriceGroupRow = { id: string; name: string; sort_order: number };
type ProductTypeRow = { id: string; code: string };
type ProductRow = {
  id: string;
  name: string;
  sku: string;
  base_product_code: string | null;
  status: "active" | "inactive" | "archived";
  brand_id: string;
  product_type_id: string;
};
type ProductImage = { url: string; alt: string };
type ProductContentRow = { id: string; base_product_code: string };
type ProductMediaRow = {
  product_content_id: string;
  url: string;
  alt_text: string | null;
  title: string | null;
  sort_order: number;
  is_primary: boolean;
};
type StoneProfileRow = {
  product_id: string;
  stone_type_id: string;
  material_price_band_id: string;
  vendor_name: string | null;
  source_ref: string | null;
  is_active: boolean;
};
type ProductPriceRow = { product_id: string; price_group_id: string; amount: string | number };
type StoneCatalogRow = ProductRow & StoneProfileRow;
type SinkCatalogRow = ProductRow & { prices: Record<string, string> };
type StoneDraft = {
  product_id?: string;
  name: string;
  sku: string;
  brand_id: string;
  stone_type_id: string;
  material_price_band_id: string;
  vendor_name: string;
  source_ref: string;
};
type SinkDraft = { product_id?: string; name: string; sku: string; brand_id: string; prices: Record<string, string> };
type CatalogEditor = "stone" | "sink" | null;
type CatalogTab = "stone" | "sink";
type CatalogRowActionsProps = {
  product: ProductRow;
  disabled: boolean;
  onEdit: () => void;
  onToggleStatus: () => void | Promise<void>;
};
type CatalogProductIdentityProps = {
  product: ProductRow;
  image?: ProductImage;
  onPreview: (image: ProductImage) => void;
};

const EMPTY_STONE: StoneDraft = {
  name: "", sku: "", brand_id: "", stone_type_id: "", material_price_band_id: "", vendor_name: "", source_ref: "",
};
const EMPTY_SINK: SinkDraft = { name: "", sku: "", brand_id: "", prices: {} };
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const STATUS_OPTIONS: Option[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function money(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount)
    : "—";
}

function getPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

function sinkPriceSummary(row: SinkCatalogRow, priceGroups: PriceGroupRow[]) {
  const amounts = priceGroups.flatMap((group) => {
    const rawAmount = row.prices[group.id];
    if (rawAmount === undefined) return [];
    const amount = Number(rawAmount);
    return Number.isFinite(amount) ? [amount] : [];
  });

  if (amounts.length === 0) {
    return {
      range: "—",
      detail: priceGroups.length ? `0/${priceGroups.length} price groups` : "No active price groups",
    };
  }

  const minimum = Math.min(...amounts);
  const maximum = Math.max(...amounts);
  return {
    range: minimum === maximum ? money(minimum) : `${money(minimum)} – ${money(maximum)}`,
    detail: `${amounts.length}/${priceGroups.length} price groups`,
  };
}

async function loadCatalogProductImages(products: ProductRow[]): Promise<Record<string, ProductImage>> {
  const baseProductCodes = Array.from(
    new Set(products.map((product) => product.base_product_code || product.sku).filter(Boolean))
  );
  if (baseProductCodes.length === 0) return {};

  const { data: contentRows, error: contentError } = await supabase
    .from("store_product_content")
    .select("id,base_product_code")
    .in("base_product_code", baseProductCodes);
  if (contentError) {
    console.error("[Countertop Catalog] product thumbnail content load failed", contentError);
    return {};
  }

  const contents = (contentRows ?? []) as ProductContentRow[];
  const contentIds = contents.map((content) => content.id);
  if (contentIds.length === 0) return {};

  const { data: mediaRows, error: mediaError } = await supabase
    .from("store_product_media")
    .select("product_content_id,url,alt_text,title,sort_order,is_primary")
    .in("product_content_id", contentIds)
    .eq("media_type", "image")
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  if (mediaError) {
    console.error("[Countertop Catalog] product thumbnail media load failed", mediaError);
    return {};
  }

  const firstImageByContentId = new Map<string, ProductMediaRow>();
  for (const media of (mediaRows ?? []) as ProductMediaRow[]) {
    if (!firstImageByContentId.has(media.product_content_id)) {
      firstImageByContentId.set(media.product_content_id, media);
    }
  }

  const imageByBaseProductCode = new Map<string, ProductImage>();
  for (const content of contents) {
    const media = firstImageByContentId.get(content.id);
    if (!media) continue;
    imageByBaseProductCode.set(content.base_product_code, {
      url: media.url,
      alt: media.alt_text || media.title || "Product image",
    });
  }

  const nextImages: Record<string, ProductImage> = {};
  for (const product of products) {
    const image = imageByBaseProductCode.get(product.base_product_code || product.sku);
    if (!image) continue;
    nextImages[product.id] = {
      ...image,
      alt: image.alt === "Product image" ? product.name : image.alt,
    };
  }
  return nextImages;
}

function CatalogProductIdentity({ product, image, onPreview }: CatalogProductIdentityProps) {
  return (
    <div className="flex min-w-[240px] items-center gap-3">
      <ProductImageThumbnail
        image={image}
        actionLabel={`View ${product.name} image`}
        onClick={() => {
          if (image) onPreview(image);
        }}
      />
      <div className="min-w-0 space-y-1">
        <div className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{product.name}</div>
        <div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{product.sku}</div>
      </div>
    </div>
  );
}

function CatalogRowActions({ product, disabled, onEdit, onToggleStatus }: CatalogRowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const closeMenu = useCallback(() => setIsOpen(false), []);

  return (
    <span ref={anchorRef} className="relative inline-flex">
      <Button
        variant="ghost"
        size="sm"
        className="dropdown-toggle"
        aria-label={`Actions for ${product.name}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
      >
        …
      </Button>
      <Dropdown
        isOpen={isOpen}
        onClose={closeMenu}
        portal
        anchorRef={anchorRef}
        role="menu"
        ariaLabel={`Actions for ${product.name}`}
        className="w-44 p-2"
      >
        <DropdownItem
          onClick={() => {
            closeMenu();
            onEdit();
          }}
        >
          Edit
        </DropdownItem>
        <DropdownItem
          onClick={() => {
            closeMenu();
            void onToggleStatus();
          }}
        >
          {product.status === "active" ? "Deactivate" : "Activate"}
        </DropdownItem>
      </Dropdown>
    </span>
  );
}

export default function CountertopCatalogManager() {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [stoneTypes, setStoneTypes] = useState<StoneTypeRow[]>([]);
  const [bands, setBands] = useState<BandRow[]>([]);
  const [priceGroups, setPriceGroups] = useState<PriceGroupRow[]>([]);
  const [stones, setStones] = useState<StoneCatalogRow[]>([]);
  const [sinks, setSinks] = useState<SinkCatalogRow[]>([]);
  const [productImages, setProductImages] = useState<Record<string, ProductImage>>({});
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null);
  const [stoneDraft, setStoneDraft] = useState<StoneDraft>(EMPTY_STONE);
  const [sinkDraft, setSinkDraft] = useState<SinkDraft>(EMPTY_SINK);
  const [editor, setEditor] = useState<CatalogEditor>(null);
  const [activeCatalog, setActiveCatalog] = useState<CatalogTab>("stone");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"stone" | "sink" | "status" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const brandOptions = useMemo<Option[]>(() => brands.map((row) => ({ value: row.id, label: row.name })), [brands]);
  const stoneTypeOptions = useMemo<Option[]>(() => stoneTypes.map((row) => ({ value: row.id, label: row.name })), [stoneTypes]);
  const bandOptions = useMemo<Option[]>(() => bands.map((row) => ({ value: row.id, label: `${row.code} — ${money(row.price_per_sqft)} / sq ft` })), [bands]);
  const brandById = useMemo(() => new Map(brands.map((row) => [row.id, row.name])), [brands]);
  const stoneTypeById = useMemo(() => new Map(stoneTypes.map((row) => [row.id, row.name])), [stoneTypes]);
  const bandById = useMemo(() => new Map(bands.map((row) => [row.id, `${row.code} — ${money(row.price_per_sqft)} / sq ft`])), [bands]);
  const normalizedQuery = catalogQuery.trim().toLowerCase();

  const filteredStones = useMemo(() => stones.filter((row) => {
    if (statusFilter && row.status !== statusFilter) return false;
    if (!normalizedQuery) return true;
    return [
      row.name,
      row.sku,
      brandById.get(row.brand_id),
      stoneTypeById.get(row.stone_type_id),
      bandById.get(row.material_price_band_id),
      row.vendor_name,
    ].some((value) => value?.toLowerCase().includes(normalizedQuery));
  }), [bandById, brandById, normalizedQuery, statusFilter, stoneTypeById, stones]);

  const filteredSinks = useMemo(() => sinks.filter((row) => {
    if (statusFilter && row.status !== statusFilter) return false;
    if (!normalizedQuery) return true;
    return [row.name, row.sku, brandById.get(row.brand_id)]
      .some((value) => value?.toLowerCase().includes(normalizedQuery));
  }), [brandById, normalizedQuery, sinks, statusFilter]);

  const activeCount = activeCatalog === "stone" ? filteredStones.length : filteredSinks.length;
  const totalPages = Math.max(1, Math.ceil(activeCount / pageSize));
  const pageStartIndex = (currentPage - 1) * pageSize;
  const pagedStones = useMemo(
    () => filteredStones.slice(pageStartIndex, pageStartIndex + pageSize),
    [filteredStones, pageSize, pageStartIndex]
  );
  const pagedSinks = useMemo(
    () => filteredSinks.slice(pageStartIndex, pageStartIndex + pageSize),
    [filteredSinks, pageSize, pageStartIndex]
  );
  const visibleProducts = activeCatalog === "stone" ? pagedStones : pagedSinks;
  const pageNumbers = useMemo(() => getPageNumbers(currentPage, totalPages), [currentPage, totalPages]);
  const firstVisibleRow = activeCount === 0 ? 0 : pageStartIndex + 1;
  const lastVisibleRow = Math.min(pageStartIndex + pageSize, activeCount);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProductImages({});
    setPreviewImage(null);
    const [brandResult, stoneTypeResult, bandResult, priceGroupResult, productTypeResult] = await Promise.all([
      supabase.from("product_brands").select("id,name").eq("status", "active").order("name"),
      supabase.from("countertop_stone_types").select("id,name").eq("is_active", true).order("name"),
      supabase.from("countertop_material_price_bands").select("id,code,price_per_sqft").eq("is_active", true).order("sort_order"),
      supabase.from("price_groups").select("id,name,sort_order,available_for_orders,internal_only,is_active").eq("is_active", true).eq("available_for_orders", true).eq("internal_only", false).order("sort_order"),
      supabase.from("product_types").select("id,code").in("code", ["STONE", "SINK"]).eq("is_active", true),
    ]);
    const referenceFailure = [brandResult, stoneTypeResult, bandResult, priceGroupResult, productTypeResult].find((result) => result.error);
    if (referenceFailure?.error) {
      setError(referenceFailure.error.message || "Unable to load Countertop Catalog references.");
      setLoading(false);
      return false;
    }
    const typeRows = (productTypeResult.data ?? []) as ProductTypeRow[];
    const stoneType = typeRows.find((row) => row.code === "STONE");
    const sinkType = typeRows.find((row) => row.code === "SINK");
    if (!stoneType || !sinkType) {
      setError("Canonical STONE and SINK Product Types are required before the catalog can be managed.");
      setLoading(false);
      return false;
    }
    const [productResult, profileResult] = await Promise.all([
      supabase.from("products").select("id,name,sku,base_product_code,status,brand_id,product_type_id").in("product_type_id", [stoneType.id, sinkType.id]).neq("status", "archived").order("name"),
      supabase.from("countertop_stone_product_profiles").select("product_id,stone_type_id,material_price_band_id,vendor_name,source_ref,is_active"),
    ]);
    if (productResult.error || profileResult.error) {
      setError(productResult.error?.message || profileResult.error?.message || "Unable to load Countertop Catalog products.");
      setLoading(false);
      return false;
    }
    const products = (productResult.data ?? []) as ProductRow[];
    const profiles = (profileResult.data ?? []) as StoneProfileRow[];
    const profileByProduct = new Map(profiles.map((row) => [row.product_id, row]));
    const stoneProducts = products.filter((row) => row.product_type_id === stoneType.id);
    const sinkProducts = products.filter((row) => row.product_type_id === sinkType.id);
    const sinkIds = sinkProducts.map((row) => row.id);
    const priceResult = sinkIds.length
      ? await supabase.from("product_prices").select("product_id,price_group_id,amount").in("product_id", sinkIds).eq("currency_code", "USD").eq("is_active", true).is("valid_to", null)
      : { data: [] as ProductPriceRow[], error: null };
    if (priceResult.error) {
      setError(priceResult.error.message || "Unable to load sink prices.");
      setLoading(false);
      return false;
    }
    const sinkPriceMap = new Map<string, Record<string, string>>();
    for (const row of (priceResult.data ?? []) as ProductPriceRow[]) {
      const current = sinkPriceMap.get(row.product_id) ?? {};
      current[row.price_group_id] = String(row.amount);
      sinkPriceMap.set(row.product_id, current);
    }
    setBrands((brandResult.data ?? []) as BrandRow[]);
    setStoneTypes((stoneTypeResult.data ?? []) as StoneTypeRow[]);
    setBands((bandResult.data ?? []) as BandRow[]);
    setPriceGroups((priceGroupResult.data ?? []).map((row) => ({ id: row.id, name: row.name, sort_order: row.sort_order })) as PriceGroupRow[]);
    setStones(stoneProducts.flatMap((product) => {
      const profile = profileByProduct.get(product.id);
      return profile ? [{ ...product, ...profile }] : [];
    }));
    setSinks(sinkProducts.map((product) => ({ ...product, prices: sinkPriceMap.get(product.id) ?? {} })));
    setLoading(false);
    return true;
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);
  useEffect(() => {
    let cancelled = false;
    setProductImages({});
    void loadCatalogProductImages(visibleProducts).then((images) => {
      if (!cancelled) setProductImages(images);
    });
    return () => {
      cancelled = true;
    };
  }, [visibleProducts]);

  function resetMessages() { setError(null); setMessage(null); }
  function openNewStone() { resetMessages(); setStoneDraft(EMPTY_STONE); setEditor("stone"); }
  function openNewSink() { resetMessages(); setSinkDraft(EMPTY_SINK); setEditor("sink"); }
  function closeEditor() {
    if (saving === "stone" || saving === "sink") return;
    setEditor(null); setStoneDraft(EMPTY_STONE); setSinkDraft(EMPTY_SINK);
  }
  function editStone(row: StoneCatalogRow) {
    resetMessages();
    setStoneDraft({ product_id: row.id, name: row.name, sku: row.sku, brand_id: row.brand_id, stone_type_id: row.stone_type_id, material_price_band_id: row.material_price_band_id, vendor_name: row.vendor_name ?? "", source_ref: row.source_ref ?? "" });
    setEditor("stone");
  }
  function editSink(row: SinkCatalogRow) {
    resetMessages();
    setSinkDraft({ product_id: row.id, name: row.name, sku: row.sku, brand_id: row.brand_id, prices: { ...row.prices } });
    setEditor("sink");
  }
  function changeCatalog(tab: CatalogTab) {
    setActiveCatalog(tab);
    setCurrentPage(1);
  }
  function changeQuery(value: string) {
    setCatalogQuery(value);
    setCurrentPage(1);
  }
  function changeStatus(value: string) {
    setStatusFilter(value);
    setCurrentPage(1);
  }
  function changePageSize(value: string) {
    const nextPageSize = Number(value);
    if (!PAGE_SIZE_OPTIONS.includes(nextPageSize as (typeof PAGE_SIZE_OPTIONS)[number])) return;
    setPageSize(nextPageSize);
    setCurrentPage(1);
  }

  async function saveStone() {
    resetMessages();
    const normalized = { ...stoneDraft, name: stoneDraft.name.trim(), sku: stoneDraft.sku.trim().toUpperCase(), vendor_name: stoneDraft.vendor_name.trim(), source_ref: stoneDraft.source_ref.trim() };
    if (!normalized.name || !normalized.sku || !normalized.brand_id || !normalized.stone_type_id || !normalized.material_price_band_id) {
      setError("Stone Name, SKU, Brand, Stone Type and Material Price Band are required."); return;
    }
    setSaving("stone");
    const { error: saveError } = await supabase.rpc("save_countertop_catalog_product", {
      p_kind: "stone", p_product_id: normalized.product_id ?? null, p_name: normalized.name, p_sku: normalized.sku,
      p_brand_id: normalized.brand_id, p_stone_type_id: normalized.stone_type_id, p_material_price_band_id: normalized.material_price_band_id,
      p_vendor_name: normalized.vendor_name || null, p_source_ref: normalized.source_ref || null, p_prices: null,
    });
    setSaving(null);
    if (saveError) { setError(saveError.message); return; }
    const successMessage = normalized.product_id ? "Stone updated." : "Stone added to the Countertop Catalog.";
    setEditor(null); setStoneDraft(EMPTY_STONE);
    if (await load()) setMessage(successMessage);
  }

  async function saveSink() {
    resetMessages();
    const name = sinkDraft.name.trim(); const sku = sinkDraft.sku.trim().toUpperCase();
    if (!name || !sku || !sinkDraft.brand_id) { setError("Sink Name, SKU and Brand are required."); return; }
    const prices = priceGroups.map((group) => ({ price_group_id: group.id, amount: (sinkDraft.prices[group.id] ?? "").trim() }));
    if (!priceGroups.length || prices.some((price) => price.amount === "" || !Number.isFinite(Number(price.amount)) || Number(price.amount) < 0)) {
      setError("Enter a non-negative Sink price for every active order price group."); return;
    }
    setSaving("sink");
    const { error: saveError } = await supabase.rpc("save_countertop_catalog_product", {
      p_kind: "sink", p_product_id: sinkDraft.product_id ?? null, p_name: name, p_sku: sku, p_brand_id: sinkDraft.brand_id,
      p_stone_type_id: null, p_material_price_band_id: null, p_vendor_name: null, p_source_ref: null, p_prices: prices,
    });
    setSaving(null);
    if (saveError) { setError(saveError.message); return; }
    const successMessage = sinkDraft.product_id ? "Sink and prices updated." : "Sink added to the Countertop Catalog.";
    setEditor(null); setSinkDraft(EMPTY_SINK);
    if (await load()) setMessage(successMessage);
  }

  async function toggleStatus(product: ProductRow) {
    resetMessages(); setSaving("status");
    const nextStatus = product.status === "active" ? "inactive" : "active";
    const { error: statusError } = await supabase.rpc("set_product_status", { p_product_id: product.id, p_status: nextStatus });
    setSaving(null);
    if (statusError) { setError(statusError.message); return; }
    if (await load()) setMessage(`${product.name} is now ${nextStatus}.`);
  }

  const addAction = activeCatalog === "stone"
    ? <Button onClick={openNewStone}>Add Stone</Button>
    : <Button onClick={openNewSink}>Add Sink</Button>;
  const cardDescription = activeCatalog === "stone"
    ? "Stone products use Material Price Bands for catalog $/sq ft pricing."
    : "Sink prices remain maintained across every active order-eligible Price Group.";
  const emptyMessage = activeCatalog === "stone" ? "No Stone products match these filters." : "No Sink products match these filters.";

  return (
    <div className="space-y-6">
      {error ? <div className="space-y-3"><Alert variant="error" title="Countertop Catalog" message={error} /><Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div> : null}
      {message ? <Alert variant="success" title="Countertop Catalog" message={message} /> : null}

      <ComponentCard title="Catalog" desc={cardDescription} headerAction={addAction}>
        <div className="space-y-5">
          <div role="tablist" aria-label="Countertop catalog type" className="flex flex-wrap gap-2">
            <Button
              id="countertop-tab-stone"
              role="tab"
              aria-selected={activeCatalog === "stone"}
              aria-controls="countertop-panel-stone"
              variant={activeCatalog === "stone" ? "primary" : "outline"}
              size="sm"
              onClick={() => changeCatalog("stone")}
            >
              Stones ({stones.length})
            </Button>
            <Button
              id="countertop-tab-sink"
              role="tab"
              aria-selected={activeCatalog === "sink"}
              aria-controls="countertop-panel-sink"
              variant={activeCatalog === "sink" ? "primary" : "outline"}
              size="sm"
              onClick={() => changeCatalog("sink")}
            >
              Sinks ({sinks.length})
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="countertop-catalog-search">Search</Label>
              <Input
                id="countertop-catalog-search"
                placeholder="Search catalog"
                value={catalogQuery}
                ariaLabel={`Search ${activeCatalog === "stone" ? "Stones" : "Sinks"}`}
                onChange={(event) => changeQuery(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="countertop-catalog-status">Status</Label>
              <Select
                id="countertop-catalog-status"
                value={statusFilter}
                options={STATUS_OPTIONS}
                placeholder="All statuses"
                allowEmpty
                ariaLabel="Filter Countertop Catalog by status"
                onChange={changeStatus}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="countertop-catalog-page-size">Rows per page</Label>
              <Select
                id="countertop-catalog-page-size"
                value={String(pageSize)}
                options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: `${size} rows` }))}
                placeholder="Rows per page"
                ariaLabel="Countertop Catalog rows per page"
                onChange={changePageSize}
              />
            </div>
          </div>

          <div
            id={activeCatalog === "stone" ? "countertop-panel-stone" : "countertop-panel-sink"}
            role="tabpanel"
            aria-labelledby={activeCatalog === "stone" ? "countertop-tab-stone" : "countertop-tab-sink"}
            className="space-y-4"
          >
            <TableViewport>
              <Table variant="admin" minWidth="standard">
                <TableHeader variant="admin">
                  <TableRow>
                    {(activeCatalog === "stone"
                      ? ["Stone", "Details", "Price Band", "Status", "Actions"]
                      : ["Sink", "Brand", "Pricing", "Status", "Actions"]
                    ).map((heading) => <TableCell key={heading} isHeader variant="admin">{heading}</TableCell>)}
                  </TableRow>
                </TableHeader>
                <TableBody variant="admin">
                  {loading ? (
                    <TableStateRow colSpan={5}>Loading {activeCatalog === "stone" ? "Stone" : "Sink"} products…</TableStateRow>
                  ) : activeCount === 0 ? (
                    <TableStateRow colSpan={5}>{emptyMessage}</TableStateRow>
                  ) : activeCatalog === "stone" ? pagedStones.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell variant="admin">
                        <CatalogProductIdentity product={row} image={productImages[row.id]} onPreview={setPreviewImage} />
                      </TableCell>
                      <TableCell variant="admin">
                        <div className="space-y-1">
                          <div>{brandById.get(row.brand_id) ?? "—"}</div>
                          <div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{stoneTypeById.get(row.stone_type_id) ?? "—"}</div>
                          {row.vendor_name ? <div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Vendor: {row.vendor_name}</div> : null}
                        </div>
                      </TableCell>
                      <TableCell variant="admin">{bandById.get(row.material_price_band_id) ?? "—"}</TableCell>
                      <TableCell variant="admin"><Badge color={row.status === "active" ? "success" : "light"}>{row.status === "active" ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell variant="admin"><CatalogRowActions product={row} disabled={saving === "status"} onEdit={() => editStone(row)} onToggleStatus={() => toggleStatus(row)} /></TableCell>
                    </TableRow>
                  )) : pagedSinks.map((row) => {
                    const summary = sinkPriceSummary(row, priceGroups);
                    return (
                      <TableRow key={row.id}>
                        <TableCell variant="admin">
                          <CatalogProductIdentity product={row} image={productImages[row.id]} onPreview={setPreviewImage} />
                        </TableCell>
                        <TableCell variant="admin">{brandById.get(row.brand_id) ?? "—"}</TableCell>
                        <TableCell variant="admin">
                          <div className="space-y-1">
                            <div className={ADMIN_TEXT_STYLES.strong}>{summary.range}</div>
                            <div className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{summary.detail}</div>
                          </div>
                        </TableCell>
                        <TableCell variant="admin"><Badge color={row.status === "active" ? "success" : "light"}>{row.status === "active" ? "Active" : "Inactive"}</Badge></TableCell>
                        <TableCell variant="admin"><CatalogRowActions product={row} disabled={saving === "status"} onEdit={() => editSink(row)} onToggleStatus={() => toggleStatus(row)} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableViewport>

            {!loading ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className={`text-sm ${ADMIN_TEXT_STYLES.muted}`}>
                  Showing {firstVisibleRow}–{lastVisibleRow} of {activeCount}
                </div>
                <div className="flex flex-wrap items-center gap-2" aria-label="Countertop Catalog pagination">
                  <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</Button>
                  {pageNumbers.map((page) => (
                    <Button
                      key={page}
                      variant={page === currentPage ? "primary" : "outline"}
                      size="sm"
                      aria-current={page === currentPage ? "page" : undefined}
                      aria-label={`Page ${page}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Next</Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </ComponentCard>

      <Modal
        isOpen={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        ariaLabel="Countertop product image preview"
        className="m-4 max-w-5xl overflow-hidden"
      >
        {previewImage ? (
          <div className="flex max-h-[calc(100vh-4rem)] items-center justify-center p-4 sm:p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.url}
              alt={previewImage.alt}
              className="max-h-[calc(100vh-7rem)] w-full object-contain"
            />
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={editor === "stone"} onClose={closeEditor} className="m-4 max-h-[90vh] max-w-3xl overflow-y-auto p-6" ariaLabel="Stone editor">
        <div className="space-y-6">
          <h3 className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{stoneDraft.product_id ? "Edit Stone" : "Add Stone"}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor="stone-name">Stone Name *</Label><Input id="stone-name" value={stoneDraft.name} onChange={(event) => setStoneDraft((draft) => ({ ...draft, name: event.target.value }))} /></div>
            <div><Label htmlFor="stone-sku">SKU *</Label><Input id="stone-sku" value={stoneDraft.sku} onChange={(event) => setStoneDraft((draft) => ({ ...draft, sku: event.target.value }))} /></div>
            <div><Label htmlFor="stone-brand">Brand *</Label><Select id="stone-brand" value={stoneDraft.brand_id} options={brandOptions} placeholder="Select brand" onChange={(value) => setStoneDraft((draft) => ({ ...draft, brand_id: value }))} /></div>
            <div><Label htmlFor="stone-type">Stone Type *</Label><Select id="stone-type" value={stoneDraft.stone_type_id} options={stoneTypeOptions} placeholder="Select Stone Type" onChange={(value) => setStoneDraft((draft) => ({ ...draft, stone_type_id: value }))} /></div>
            <div><Label htmlFor="stone-band">Material Price Band *</Label><Select id="stone-band" value={stoneDraft.material_price_band_id} options={bandOptions} placeholder="Select Material Price Band" onChange={(value) => setStoneDraft((draft) => ({ ...draft, material_price_band_id: value }))} /></div>
            <div><Label htmlFor="stone-vendor">Vendor</Label><Input id="stone-vendor" value={stoneDraft.vendor_name} onChange={(event) => setStoneDraft((draft) => ({ ...draft, vendor_name: event.target.value }))} /></div>
            <div className="md:col-span-2"><Label htmlFor="stone-source">Source</Label><Input id="stone-source" value={stoneDraft.source_ref} onChange={(event) => setStoneDraft((draft) => ({ ...draft, source_ref: event.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-3"><Button variant="outline" disabled={saving === "stone"} onClick={closeEditor}>Cancel</Button><Button disabled={saving === "stone"} onClick={() => void saveStone()}>{saving === "stone" ? "Saving…" : "Save Stone"}</Button></div>
        </div>
      </Modal>

      <Modal isOpen={editor === "sink"} onClose={closeEditor} className="m-4 max-h-[90vh] max-w-3xl overflow-y-auto p-6" ariaLabel="Sink editor">
        <div className="space-y-6">
          <h3 className={`text-lg font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{sinkDraft.product_id ? "Edit Sink" : "Add Sink"}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label htmlFor="sink-name">Sink Name *</Label><Input id="sink-name" value={sinkDraft.name} onChange={(event) => setSinkDraft((draft) => ({ ...draft, name: event.target.value }))} /></div>
            <div><Label htmlFor="sink-sku">SKU *</Label><Input id="sink-sku" value={sinkDraft.sku} onChange={(event) => setSinkDraft((draft) => ({ ...draft, sku: event.target.value }))} /></div>
            <div className="md:col-span-2"><Label htmlFor="sink-brand">Brand *</Label><Select id="sink-brand" value={sinkDraft.brand_id} options={brandOptions} placeholder="Select brand" onChange={(value) => setSinkDraft((draft) => ({ ...draft, brand_id: value }))} /></div>
          </div>
          <div className="space-y-4"><h4 className={`text-base font-semibold ${ADMIN_TEXT_STYLES.strong}`}>Sink prices</h4><div className="grid gap-4 md:grid-cols-2">
            {priceGroups.map((group) => <div key={group.id}><Label htmlFor={`sink-price-${group.id}`}>{group.name} *</Label><Input id={`sink-price-${group.id}`} type="number" min={0} step="0.01" value={sinkDraft.prices[group.id] ?? ""} onChange={(event) => setSinkDraft((draft) => ({ ...draft, prices: { ...draft.prices, [group.id]: event.target.value } }))} /></div>)}
          </div></div>
          <div className="flex justify-end gap-3"><Button variant="outline" disabled={saving === "sink"} onClick={closeEditor}>Cancel</Button><Button disabled={saving === "sink"} onClick={() => void saveSink()}>{saving === "sink" ? "Saving…" : "Save Sink"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
