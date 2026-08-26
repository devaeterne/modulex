"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

type ProductStatus = "active" | "inactive";

type ProductRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand_id: string | null;
  category_id: string | null;
  status: ProductStatus;
};

type LookupRow = {
  id: string;
  name: string;
};

type PriceGroup = {
  id: string;
  system_key: string;
  name: string;
  sort_order: number;
  is_base_price: boolean;
  is_active: boolean;
  color_key: string | null;
};

type ProductPrice = {
  id: string;
  product_id: string;
  price_group_id: string;
  amount: string | number;
  currency_code: string;
};

type ProductCost = {
  id: string;
  product_id: string;
  amount: string | number;
  currency_code: string;
};

type StockTotal = {
  product_id: string;
  quantity: string | number;
  reserved_quantity: string | number;
  available_quantity: string | number;
};

type ProductMarginSetting = {
  product_id: string;
  min_margin_percent: string | number;
};

type PricingSettings = {
  id: number;
  default_min_margin_percent: string | number;
  warning_margin_buffer_percent: string | number;
  currency_code: string;
};

type StockFilter =
  | "all"
  | "in_stock"
  | "out_of_stock";

type MarginFilter =
  | "all"
  | "healthy"
  | "warning"
  | "critical"
  | "loss"
  | "missing_cost"
  | "no_price";

type MarginHealth =
  | "healthy"
  | "warning"
  | "critical"
  | "loss"
  | "missing_cost"
  | "no_price";

type BulkCostMode =
  | "current_percent"
  | "current_amount"
  | "set_amount";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs transition placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-500 dark:focus:border-brand-500";

const selectClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs transition focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const primaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 focus:outline-none focus:ring-3 focus:ring-gray-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";

const smallButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";

const priceGroupBadgeClasses: Record<string, string> = {
  brand:
    "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400",
  blue:
    "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  purple:
    "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
  amber:
    "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  rose:
    "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  cyan:
    "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400",
  orange:
    "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  pink:
    "bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-400",
  indigo:
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  teal:
    "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
  lime:
    "bg-lime-50 text-lime-700 dark:bg-lime-500/15 dark:text-lime-400",
  emerald:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  sky:
    "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
};

function makePriceKey(
  productId: string,
  groupId: string
) {
  return `${productId}:${groupId}`;
}

function normalizeNumber(value: string | undefined) {
  const raw = (value ?? "")
    .trim()
    .replace(",", ".");

  if (!raw) return "";

  const number = Number(raw);

  if (!Number.isFinite(number)) {
    return `invalid:${raw}`;
  }

  return number.toFixed(4);
}

function parseNumber(value: string | undefined) {
  const raw = (value ?? "")
    .trim()
    .replace(",", ".");

  if (!raw) return null;

  const number = Number(raw);

  return Number.isFinite(number)
    ? number
    : null;
}

function formatInputAmount(
  value: string | number
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "";
  }

  return number
    .toFixed(2)
    .replace(/\.?0+$/, "");
}

function formatMoney(
  value: number | null
) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatStock(
  value: number
) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function calculateMargin(
  price: number | null,
  cost: number | null
) {
  if (
    price === null ||
    cost === null ||
    price <= 0
  ) {
    return null;
  }

  return (
    ((price - cost) / price) *
    100
  );
}

function getMarginHealth(
  margin: number | null,
  minMargin: number,
  warningBuffer: number
): MarginHealth {
  if (margin === null) {
    return "no_price";
  }

  if (margin < 0) {
    return "loss";
  }

  if (
    margin <
    minMargin - warningBuffer
  ) {
    return "critical";
  }

  if (margin < minMargin) {
    return "warning";
  }

  return "healthy";
}

function marginBadgeClass(
  health: MarginHealth
) {
  switch (health) {
    case "healthy":
      return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";

    case "warning":
      return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";

    case "critical":
      return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";

    case "loss":
      return "bg-error-100 text-error-800 dark:bg-error-500/20 dark:text-error-300";

    default:
      return "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400";
  }
}

function healthLabel(
  health: MarginHealth
) {
  switch (health) {
    case "healthy":
      return "Healthy";
    case "warning":
      return "Warning";
    case "critical":
      return "Critical";
    case "loss":
      return "Loss";
    case "missing_cost":
      return "Missing Cost";
    case "no_price":
      return "No Price";
  }
}

export default function CostMarginTable() {
  const [hasAccess, setHasAccess] =
    useState<boolean | null>(null);

  const [products, setProducts] =
    useState<ProductRow[]>([]);

  const [brands, setBrands] =
    useState<LookupRow[]>([]);

  const [categories, setCategories] =
    useState<LookupRow[]>([]);

  const [priceGroups, setPriceGroups] =
    useState<PriceGroup[]>([]);

  const [priceValues, setPriceValues] =
    useState<Record<string, number>>({});

  const [stockTotals, setStockTotals] =
    useState<Record<string, number>>({});

  const [costValues, setCostValues] =
    useState<Record<string, string>>({});

  const [
    originalCostValues,
    setOriginalCostValues,
  ] = useState<Record<string, string>>({});

  const [
    marginOverrides,
    setMarginOverrides,
  ] = useState<Record<string, string>>({});

  const [
    originalMarginOverrides,
    setOriginalMarginOverrides,
  ] = useState<Record<string, string>>({});

  const [
    defaultMinMargin,
    setDefaultMinMargin,
  ] = useState("20");

  const [
    warningBuffer,
    setWarningBuffer,
  ] = useState("5");

  const [
    originalDefaultMinMargin,
    setOriginalDefaultMinMargin,
  ] = useState("20");

  const [
    originalWarningBuffer,
    setOriginalWarningBuffer,
  ] = useState("5");

  const [selectedIds, setSelectedIds] =
    useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSaving, setIsSaving] =
    useState(false);

  const [
    isSavingSettings,
    setIsSavingSettings,
  ] = useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [
    successMessage,
    setSuccessMessage,
  ] = useState<string | null>(null);

  // Collapsible areas
  const [filtersOpen, setFiltersOpen] =
    useState(false);

  const [bulkOpen, setBulkOpen] =
    useState(false);

  const [
    settingsOpen,
    setSettingsOpen,
  ] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] =
    useState("");

  const [brandFilter, setBrandFilter] =
    useState("");

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState("");

  const [statusFilter, setStatusFilter] =
    useState<"all" | ProductStatus>("all");

  const [stockFilter, setStockFilter] =
    useState<StockFilter>("all");

  const [marginFilter, setMarginFilter] =
    useState<MarginFilter>("all");

  // Pagination
  const [currentPage, setCurrentPage] =
    useState(1);

  const [pageSize, setPageSize] =
    useState(50);

  // Bulk cost
  const [bulkMode, setBulkMode] =
    useState<BulkCostMode>(
      "current_percent"
    );

  const [bulkValue, setBulkValue] =
    useState("");

  const brandMap = useMemo(
    () =>
      new Map(
        brands.map((item) => [
          item.id,
          item.name,
        ])
      ),
    [brands]
  );

  const categoryMap = useMemo(
    () =>
      new Map(
        categories.map((item) => [
          item.id,
          item.name,
        ])
      ),
    [categories]
  );

  const sortedPriceGroups = useMemo(
    () =>
      [...priceGroups].sort((a, b) => {
        if (
          a.is_base_price &&
          !b.is_base_price
        ) {
          return -1;
        }

        if (
          !a.is_base_price &&
          b.is_base_price
        ) {
          return 1;
        }

        return (
          a.sort_order -
          b.sort_order
        );
      }),
    [priceGroups]
  );

  const defaultMarginNumber =
    parseNumber(defaultMinMargin) ?? 20;

  const warningBufferNumber =
    parseNumber(warningBuffer) ?? 5;

  function getEffectiveMinMargin(
    productId: string
  ) {
    const override =
      parseNumber(
        marginOverrides[productId]
      );

    return (
      override ??
      defaultMarginNumber
    );
  }

  function getProductHealth(
    productId: string
  ): MarginHealth {
    const cost =
      parseNumber(costValues[productId]);

    if (cost === null) {
      return "missing_cost";
    }

    const minMargin =
      getEffectiveMinMargin(productId);

    const healthPriority: Record<
      MarginHealth,
      number
    > = {
      no_price: 0,
      healthy: 1,
      warning: 2,
      critical: 3,
      loss: 4,
      missing_cost: 5,
    };

    let worst: MarginHealth =
      "no_price";

    let hasPrice = false;

    for (const group of sortedPriceGroups) {
      const price =
        priceValues[
        makePriceKey(
          productId,
          group.id
        )
        ];

      if (
        price === undefined ||
        price === null
      ) {
        continue;
      }

      hasPrice = true;

      const margin =
        calculateMargin(price, cost);

      const health =
        getMarginHealth(
          margin,
          minMargin,
          warningBufferNumber
        );

      if (
        healthPriority[health] >
        healthPriority[worst]
      ) {
        worst = health;
      }
    }

    return hasPrice
      ? worst
      : "no_price";
  }

  const filteredProducts = useMemo(() => {
    const query = searchQuery
      .trim()
      .toLowerCase();

    return products.filter((product) => {
      const brand =
        product.brand_id
          ? brandMap.get(
            product.brand_id
          ) ?? ""
          : "";

      const category =
        product.category_id
          ? categoryMap.get(
            product.category_id
          ) ?? ""
          : "";

      const stock =
        stockTotals[product.id] ?? 0;

      const health =
        getProductHealth(product.id);

      const matchesSearch =
        !query ||
        product.sku
          .toLowerCase()
          .includes(query) ||
        product.name
          .toLowerCase()
          .includes(query) ||
        (product.barcode ?? "")
          .toLowerCase()
          .includes(query) ||
        brand
          .toLowerCase()
          .includes(query) ||
        category
          .toLowerCase()
          .includes(query);

      const matchesBrand =
        !brandFilter ||
        product.brand_id ===
        brandFilter;

      const matchesCategory =
        !categoryFilter ||
        product.category_id ===
        categoryFilter;

      const matchesStatus =
        statusFilter === "all" ||
        product.status ===
        statusFilter;

      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "in_stock" &&
          stock > 0) ||
        (stockFilter ===
          "out_of_stock" &&
          stock <= 0);

      const matchesMargin =
        marginFilter === "all" ||
        health === marginFilter;

      return (
        matchesSearch &&
        matchesBrand &&
        matchesCategory &&
        matchesStatus &&
        matchesStock &&
        matchesMargin
      );
    });
  }, [
    products,
    searchQuery,
    brandFilter,
    categoryFilter,
    statusFilter,
    stockFilter,
    marginFilter,
    brandMap,
    categoryMap,
    stockTotals,
    costValues,
    marginOverrides,
    priceValues,
    sortedPriceGroups,
    defaultMarginNumber,
    warningBufferNumber,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredProducts.length /
      pageSize
    )
  );

  const paginatedProducts =
    useMemo(() => {
      const start =
        (currentPage - 1) *
        pageSize;

      return filteredProducts.slice(
        start,
        start + pageSize
      );
    }, [
      filteredProducts,
      currentPage,
      pageSize,
    ]);

  const currentPageIds =
    paginatedProducts.map(
      (product) => product.id
    );

  const allCurrentPageSelected =
    currentPageIds.length > 0 &&
    currentPageIds.every((id) =>
      selectedIds.has(id)
    );

  const costDirtyIds = useMemo(
    () =>
      products
        .filter(
          (product) =>
            normalizeNumber(
              costValues[product.id]
            ) !==
            normalizeNumber(
              originalCostValues[
              product.id
              ]
            )
        )
        .map((product) => product.id),
    [
      products,
      costValues,
      originalCostValues,
    ]
  );

  const marginDirtyIds = useMemo(
    () =>
      products
        .filter(
          (product) =>
            normalizeNumber(
              marginOverrides[
              product.id
              ]
            ) !==
            normalizeNumber(
              originalMarginOverrides[
              product.id
              ]
            )
        )
        .map((product) => product.id),
    [
      products,
      marginOverrides,
      originalMarginOverrides,
    ]
  );

  const dirtyCount =
    costDirtyIds.length +
    marginDirtyIds.length;

  const activeFilterCount =
    [
      searchQuery.trim(),
      brandFilter,
      categoryFilter,
      statusFilter !== "all"
        ? statusFilter
        : "",
      stockFilter !== "all"
        ? stockFilter
        : "",
      marginFilter !== "all"
        ? marginFilter
        : "",
    ].filter(Boolean).length;

  const productsWithCost =
    products.filter(
      (product) =>
        parseNumber(
          costValues[product.id]
        ) !== null
    ).length;

  const missingCostCount =
    products.length -
    productsWithCost;

  const belowMarginCount =
    products.filter((product) => {
      const health =
        getProductHealth(product.id);

      return (
        health === "warning" ||
        health === "critical" ||
        health === "loss"
      );
    }).length;

  const healthyCount =
    products.filter(
      (product) =>
        getProductHealth(
          product.id
        ) === "healthy"
    ).length;

  const settingsDirty =
    normalizeNumber(defaultMinMargin) !==
    normalizeNumber(
      originalDefaultMinMargin
    ) ||
    normalizeNumber(warningBuffer) !==
    normalizeNumber(
      originalWarningBuffer
    );

  async function fetchAllCurrentPrices() {
    const allRows: ProductPrice[] = [];

    const batchSize = 1000;
    let from = 0;

    while (true) {
      const { data, error } =
        await supabase
          .from("product_prices")
          .select(
            `
              id,
              product_id,
              price_group_id,
              amount,
              currency_code
            `
          )
          .eq("is_active", true)
          .is("valid_to", null)
          .eq("currency_code", "USD")
          .order("id")
          .range(
            from,
            from + batchSize - 1
          );

      if (error) {
        return {
          data: [] as ProductPrice[],
          error,
        };
      }

      const rows =
        (data ??
          []) as ProductPrice[];

      allRows.push(...rows);

      if (
        rows.length <
        batchSize
      ) {
        break;
      }

      from += batchSize;
    }

    return {
      data: allRows,
      error: null,
    };
  }

  async function fetchAllCurrentCosts() {
    const allRows: ProductCost[] = [];

    const batchSize = 1000;
    let from = 0;

    while (true) {
      const { data, error } =
        await supabase
          .from("product_costs")
          .select(
            `
              id,
              product_id,
              amount,
              currency_code
            `
          )
          .eq("is_active", true)
          .is("valid_to", null)
          .eq("currency_code", "USD")
          .order("id")
          .range(
            from,
            from + batchSize - 1
          );

      if (error) {
        return {
          data: [] as ProductCost[],
          error,
        };
      }

      const rows =
        (data ??
          []) as ProductCost[];

      allRows.push(...rows);

      if (
        rows.length <
        batchSize
      ) {
        break;
      }

      from += batchSize;
    }

    return {
      data: allRows,
      error: null,
    };
  }

  async function loadData() {
    setIsLoading(true);
    setErrorMessage(null);

    const [
      productsResult,
      brandsResult,
      categoriesResult,
      groupsResult,
      pricesResult,
      costsResult,
      stockResult,
      marginResult,
      settingsResult,
    ] = await Promise.all([
      supabase
        .from("products")
        .select(
          `
            id,
            sku,
            barcode,
            name,
            brand_id,
            category_id,
            status
          `
        )
        .in("status", [
          "active",
          "inactive",
        ])
        .order("sku"),

      supabase
        .from("product_brands")
        .select("id, name")
        .order("name"),

      supabase
        .from("product_categories")
        .select("id, name")
        .order("name"),

      supabase
        .from("price_groups")
        .select(
          `
            id,
            system_key,
            name,
            sort_order,
            is_base_price,
            is_active,
            color_key
          `
        )
        .eq("is_active", true)
        .order("sort_order"),

      fetchAllCurrentPrices(),

      fetchAllCurrentCosts(),

      supabase.rpc(
        "get_product_stock_totals"
      ),

      supabase
        .from(
          "product_margin_settings"
        )
        .select(
          `
            product_id,
            min_margin_percent
          `
        ),

      supabase
        .from("pricing_settings")
        .select(
          `
            id,
            default_min_margin_percent,
            warning_margin_buffer_percent,
            currency_code
          `
        )
        .eq("id", 1)
        .single(),
    ]);

    const firstError =
      productsResult.error ||
      brandsResult.error ||
      categoriesResult.error ||
      groupsResult.error ||
      pricesResult.error ||
      costsResult.error ||
      stockResult.error ||
      marginResult.error ||
      settingsResult.error;

    if (firstError) {
      setErrorMessage(
        firstError.message
      );

      setIsLoading(false);
      return;
    }

    const loadedProducts =
      (productsResult.data ??
        []) as ProductRow[];

    const loadedPrices =
      pricesResult.data;

    const loadedCosts =
      costsResult.data;

    const loadedStocks =
      (stockResult.data ??
        []) as StockTotal[];

    const loadedMargins =
      (marginResult.data ??
        []) as ProductMarginSetting[];

    const settings =
      settingsResult.data as PricingSettings;

    const newPrices: Record<
      string,
      number
    > = {};

    const newCosts: Record<
      string,
      string
    > = {};

    const newStocks: Record<
      string,
      number
    > = {};

    const newOverrides: Record<
      string,
      string
    > = {};

    for (const price of loadedPrices) {
      newPrices[
        makePriceKey(
          price.product_id,
          price.price_group_id
        )
      ] = Number(price.amount);
    }

    for (const cost of loadedCosts) {
      newCosts[cost.product_id] =
        formatInputAmount(
          cost.amount
        );
    }

    for (const stock of loadedStocks) {
      newStocks[stock.product_id] =
        Number(
          stock.available_quantity ?? 0
        );
    }

    for (
      const setting
      of loadedMargins
    ) {
      newOverrides[
        setting.product_id
      ] = formatInputAmount(
        setting.min_margin_percent
      );
    }

    const defaultMargin =
      formatInputAmount(
        settings.default_min_margin_percent
      );

    const buffer =
      formatInputAmount(
        settings.warning_margin_buffer_percent
      );

    setProducts(loadedProducts);

    setBrands(
      (brandsResult.data ??
        []) as LookupRow[]
    );

    setCategories(
      (categoriesResult.data ??
        []) as LookupRow[]
    );

    setPriceGroups(
      (groupsResult.data ??
        []) as PriceGroup[]
    );

    setPriceValues(newPrices);
    setStockTotals(newStocks);

    setCostValues({
      ...newCosts,
    });

    setOriginalCostValues({
      ...newCosts,
    });

    setMarginOverrides({
      ...newOverrides,
    });

    setOriginalMarginOverrides({
      ...newOverrides,
    });

    setDefaultMinMargin(
      defaultMargin
    );

    setOriginalDefaultMinMargin(
      defaultMargin
    );

    setWarningBuffer(buffer);

    setOriginalWarningBuffer(
      buffer
    );

    setIsLoading(false);
  }

  useEffect(() => {
    async function initialize() {
      const { profile } =
        await getCurrentProfile();

      const allowed =
        profile?.role ===
        "super_admin" ||
        profile?.role ===
        "admin";

      setHasAccess(allowed);

      if (!allowed) {
        setIsLoading(false);
        return;
      }

      await loadData();
    }

    initialize();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    brandFilter,
    categoryFilter,
    statusFilter,
    stockFilter,
    marginFilter,
    pageSize,
  ]);

  useEffect(() => {
    if (
      currentPage >
      totalPages
    ) {
      setCurrentPage(
        totalPages
      );
    }
  }, [
    currentPage,
    totalPages,
  ]);

  useEffect(() => {
    if (
      dirtyCount === 0 &&
      !settingsDirty
    ) {
      return;
    }

    function handleBeforeUnload(
      event: BeforeUnloadEvent
    ) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );
    };
  }, [
    dirtyCount,
    settingsDirty,
  ]);

  function clearMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function getGroupBadgeClass(
    group: PriceGroup
  ) {
    if (group.is_base_price) {
      return (
        priceGroupBadgeClasses.brand
      );
    }

    if (
      group.color_key &&
      priceGroupBadgeClasses[
      group.color_key
      ]
    ) {
      return priceGroupBadgeClasses[
        group.color_key
      ];
    }

    return "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300";
  }

  function toggleProductSelection(
    productId: string
  ) {
    setSelectedIds((current) => {
      const next =
        new Set(current);

      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }

      return next;
    });
  }

  function toggleCurrentPageSelection() {
    setSelectedIds((current) => {
      const next =
        new Set(current);

      if (allCurrentPageSelected) {
        currentPageIds.forEach((id) =>
          next.delete(id)
        );
      } else {
        currentPageIds.forEach((id) =>
          next.add(id)
        );
      }

      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedIds(
      new Set(
        filteredProducts.map(
          (product) => product.id
        )
      )
    );
  }

  function clearSelection() {
    setSelectedIds(
      new Set()
    );
  }

  function applyBulkCost() {
    clearMessages();

    if (
      selectedIds.size === 0
    ) {
      setErrorMessage(
        "Select at least one product."
      );
      return;
    }

    const adjustment =
      parseNumber(bulkValue);

    if (adjustment === null) {
      setErrorMessage(
        "Enter a valid adjustment value."
      );
      return;
    }

    const next = {
      ...costValues,
    };

    let applied = 0;
    let skipped = 0;

    for (
      const productId
      of selectedIds
    ) {
      const current =
        parseNumber(
          costValues[productId]
        );

      let result: number | null =
        null;

      if (
        bulkMode ===
        "set_amount"
      ) {
        result = adjustment;
      }

      if (
        bulkMode ===
        "current_percent"
      ) {
        if (current === null) {
          skipped += 1;
          continue;
        }

        result =
          current *
          (1 +
            adjustment /
            100);
      }

      if (
        bulkMode ===
        "current_amount"
      ) {
        if (current === null) {
          skipped += 1;
          continue;
        }

        result =
          current +
          adjustment;
      }

      if (
        result === null ||
        !Number.isFinite(result) ||
        result < 0
      ) {
        skipped += 1;
        continue;
      }

      next[productId] =
        result.toFixed(2);

      applied += 1;
    }

    setCostValues(next);

    if (applied === 0) {
      setErrorMessage(
        "No costs could be updated."
      );
      return;
    }

    setSuccessMessage(
      skipped > 0
        ? `Bulk cost preview applied to ${applied} products. ${skipped} were skipped.`
        : `Bulk cost preview applied to ${applied} products. Review the highlighted costs and save changes.`
    );
  }

  function resetChanges() {
    setCostValues({
      ...originalCostValues,
    });

    setMarginOverrides({
      ...originalMarginOverrides,
    });

    clearMessages();
  }

  async function saveChanges() {
    if (
      dirtyCount === 0
    ) {
      return;
    }

    clearMessages();

    const costPayload: {
      product_id: string;
      amount: number | null;
    }[] = [];

    for (
      const productId
      of costDirtyIds
    ) {
      const raw =
        costValues[productId] ??
        "";

      const value =
        parseNumber(raw);

      if (
        raw.trim() &&
        value === null
      ) {
        setErrorMessage(
          "One or more costs are invalid."
        );
        return;
      }

      if (
        value !== null &&
        value < 0
      ) {
        setErrorMessage(
          "Cost cannot be negative."
        );
        return;
      }

      costPayload.push({
        product_id: productId,
        amount: value,
      });
    }

    for (
      const productId
      of marginDirtyIds
    ) {
      const raw =
        marginOverrides[
        productId
        ] ?? "";

      if (!raw.trim()) {
        continue;
      }

      const value =
        parseNumber(raw);

      if (
        value === null ||
        value < 0 ||
        value > 100
      ) {
        setErrorMessage(
          "Minimum margin must be between 0 and 100."
        );
        return;
      }
    }

    setIsSaving(true);

    if (
      costPayload.length >
      0
    ) {
      const { error } =
        await supabase.rpc(
          "set_product_costs_bulk",
          {
            p_changes:
              costPayload,

            p_currency_code:
              "USD",
          }
        );

      if (error) {
        setErrorMessage(
          error.message
        );

        setIsSaving(false);
        return;
      }
    }

    for (
      const productId
      of marginDirtyIds
    ) {
      const raw =
        marginOverrides[
        productId
        ] ?? "";

      if (!raw.trim()) {
        const { error } =
          await supabase
            .from(
              "product_margin_settings"
            )
            .delete()
            .eq(
              "product_id",
              productId
            );

        if (error) {
          setErrorMessage(
            error.message
          );

          setIsSaving(false);
          return;
        }

        continue;
      }

      const value =
        parseNumber(raw);

      const { error } =
        await supabase
          .from(
            "product_margin_settings"
          )
          .upsert(
            {
              product_id:
                productId,

              min_margin_percent:
                value,
            },
            {
              onConflict:
                "product_id",
            }
          );

      if (error) {
        setErrorMessage(
          error.message
        );

        setIsSaving(false);
        return;
      }
    }

    const savedCount =
      dirtyCount;

    await loadData();

    setSuccessMessage(
      `${savedCount} change${savedCount === 1
        ? ""
        : "s"
      } saved successfully.`
    );

    setIsSaving(false);
  }

  async function saveSettings() {
    const min =
      parseNumber(
        defaultMinMargin
      );

    const buffer =
      parseNumber(
        warningBuffer
      );

    if (
      min === null ||
      min < 0 ||
      min > 100
    ) {
      setErrorMessage(
        "Default minimum margin must be between 0 and 100."
      );
      return;
    }

    if (
      buffer === null ||
      buffer < 0 ||
      buffer > 100
    ) {
      setErrorMessage(
        "Warning buffer must be between 0 and 100."
      );
      return;
    }

    clearMessages();

    setIsSavingSettings(true);

    const { error } =
      await supabase
        .from("pricing_settings")
        .update({
          default_min_margin_percent:
            min,

          warning_margin_buffer_percent:
            buffer,
        })
        .eq("id", 1);

    if (error) {
      setErrorMessage(
        error.message
      );

      setIsSavingSettings(false);
      return;
    }

    setOriginalDefaultMinMargin(
      formatInputAmount(min)
    );

    setOriginalWarningBuffer(
      formatInputAmount(buffer)
    );

    setSuccessMessage(
      "Margin settings saved successfully."
    );

    setIsSavingSettings(false);
  }

  function clearFilters() {
    setSearchQuery("");
    setBrandFilter("");
    setCategoryFilter("");
    setStatusFilter("all");
    setStockFilter("all");
    setMarginFilter("all");
  }

  if (
    hasAccess === false
  ) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-8 text-center dark:border-error-500/30 dark:bg-error-500/10">
        <h3 className="text-lg font-semibold text-error-700 dark:text-error-400">
          Access Denied
        </h3>

        <p className="mt-2 text-sm text-error-600 dark:text-error-400">
          Cost and margin information
          is available only to admins.
        </p>
      </div>
    );
  }

  const startRow =
    filteredProducts.length ===
      0
      ? 0
      : (currentPage - 1) *
      pageSize +
      1;

  const endRow =
    Math.min(
      currentPage * pageSize,
      filteredProducts.length
    );

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      {/* HEADER */}

      <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-800 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Cost & Margin
              </h3>

              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                USD
              </span>
            </div>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage product costs and
              monitor margins across all
              active price groups.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ToggleButton
              label="Filters"
              open={filtersOpen}
              onClick={() =>
                setFiltersOpen(
                  (value) => !value
                )
              }
              badge={
                activeFilterCount
                  ? activeFilterCount
                  : undefined
              }
            />

            <ToggleButton
              label="Bulk Cost"
              open={bulkOpen}
              onClick={() =>
                setBulkOpen(
                  (value) => !value
                )
              }
              badge={
                selectedIds.size
                  ? selectedIds.size
                  : undefined
              }
            />

            <ToggleButton
              label="Margin Settings"
              open={settingsOpen}
              onClick={() =>
                setSettingsOpen(
                  (value) => !value
                )
              }
              dirty={settingsDirty}
            />

            {dirtyCount > 0 && (
              <button
                type="button"
                onClick={resetChanges}
                disabled={isSaving}
                className={
                  secondaryButtonClass
                }
              >
                Reset
              </button>
            )}

            <button
              type="button"
              onClick={saveChanges}
              disabled={
                isSaving ||
                dirtyCount === 0
              }
              className={
                primaryButtonClass
              }
            >
              {isSaving
                ? "Saving..."
                : dirtyCount > 0
                  ? `Save Changes (${dirtyCount})`
                  : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {errorMessage && (
          <div className="mb-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mb-5 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">
            {successMessage}
          </div>
        )}

        {/* SUMMARY */}

        {!isLoading && (
          <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
            <SummaryCard
              label="Products"
              value={products.length}
            />

            <SummaryCard
              label="With Cost"
              value={productsWithCost}
              type="success"
            />

            <SummaryCard
              label="Missing Cost"
              value={missingCostCount}
              type="warning"
            />

            <SummaryCard
              label="Below Min Margin"
              value={belowMarginCount}
              type="error"
            />

            <SummaryCard
              label="Healthy"
              value={healthyCount}
              type="success"
            />
          </div>
        )}

        {/* SETTINGS */}

        {settingsOpen && (
          <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Margin Settings
              </h4>

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Global defaults apply
                unless a product has its
                own minimum margin.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Default Minimum Margin
                  (%)
                </label>

                <input
                  value={defaultMinMargin}
                  onChange={(event) =>
                    setDefaultMinMargin(
                      event.target.value
                    )
                  }
                  inputMode="decimal"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Warning Buffer (%)
                </label>

                <input
                  value={warningBuffer}
                  onChange={(event) =>
                    setWarningBuffer(
                      event.target.value
                    )
                  }
                  inputMode="decimal"
                  className={inputClass}
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={
                    !settingsDirty ||
                    isSavingSettings
                  }
                  className={`${primaryButtonClass} w-full`}
                >
                  {isSavingSettings
                    ? "Saving..."
                    : "Save Settings"}
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
              With the current values,
              margins below{" "}
              <strong>
                {defaultMarginNumber}%
              </strong>{" "}
              are below target. Margins
              below{" "}
              <strong>
                {Math.max(
                  0,
                  defaultMarginNumber -
                  warningBufferNumber
                )}
                %
              </strong>{" "}
              are considered critical.
            </div>
          </div>
        )}

        {/* FILTERS */}

        {filtersOpen && (
          <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  Filters
                </h4>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Filter products by
                  stock, margin health,
                  brand or category.
                </p>
              </div>

              {activeFilterCount >
                0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    Clear All
                  </button>
                )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
              <div className="xl:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Search
                </label>

                <input
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(
                      event.target.value
                    )
                  }
                  placeholder="SKU, product, barcode..."
                  className={inputClass}
                />
              </div>

              <FilterSelect
                label="Brand"
                value={brandFilter}
                onChange={setBrandFilter}
                options={brands}
                allLabel="All Brands"
              />

              <FilterSelect
                label="Category"
                value={categoryFilter}
                onChange={
                  setCategoryFilter
                }
                options={categories}
                allLabel="All Categories"
              />

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Stock
                </label>

                <select
                  value={stockFilter}
                  onChange={(event) =>
                    setStockFilter(
                      event.target
                        .value as StockFilter
                    )
                  }
                  className={selectClass}
                >
                  <option value="all">
                    All Stock
                  </option>
                  <option value="in_stock">
                    In Stock
                  </option>
                  <option value="out_of_stock">
                    Out of Stock
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Margin
                </label>

                <select
                  value={marginFilter}
                  onChange={(event) =>
                    setMarginFilter(
                      event.target
                        .value as MarginFilter
                    )
                  }
                  className={selectClass}
                >
                  <option value="all">
                    All Margins
                  </option>
                  <option value="healthy">
                    Healthy
                  </option>
                  <option value="warning">
                    Warning
                  </option>
                  <option value="critical">
                    Critical
                  </option>
                  <option value="loss">
                    Loss
                  </option>
                  <option value="missing_cost">
                    Missing Cost
                  </option>
                  <option value="no_price">
                    No Price
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Status
                </label>

                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target
                        .value as
                      | "all"
                      | ProductStatus
                    )
                  }
                  className={selectClass}
                >
                  <option value="all">
                    All
                  </option>
                  <option value="active">
                    Active
                  </option>
                  <option value="inactive">
                    Inactive
                  </option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* BULK COST */}

        {bulkOpen &&
          !isLoading && (
            <div className="mb-5 overflow-hidden rounded-xl border border-brand-200 bg-brand-25 dark:border-brand-500/20 dark:bg-brand-500/[0.06]">
              <div className="flex flex-col gap-3 border-b border-brand-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-brand-500/10">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    Bulk Cost
                  </h4>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {selectedIds.size}{" "}
                    products selected
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={
                      selectAllFiltered
                    }
                    disabled={
                      filteredProducts.length ===
                      0
                    }
                    className={
                      secondaryButtonClass
                    }
                  >
                    Select All Filtered (
                    {
                      filteredProducts.length
                    }
                    )
                  </button>

                  {selectedIds.size >
                    0 && (
                      <button
                        type="button"
                        onClick={
                          clearSelection
                        }
                        className={
                          secondaryButtonClass
                        }
                      >
                        Clear Selection
                      </button>
                    )}
                </div>
              </div>

              <div className="p-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Operation
                    </label>

                    <select
                      value={bulkMode}
                      onChange={(event) =>
                        setBulkMode(
                          event.target
                            .value as BulkCostMode
                        )
                      }
                      className={
                        selectClass
                      }
                    >
                      <option value="current_percent">
                        Adjust Current %
                      </option>

                      <option value="current_amount">
                        Adjust Current $
                      </option>

                      <option value="set_amount">
                        Set Exact Cost
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                      {bulkMode ===
                        "current_percent"
                        ? "Percentage (%)"
                        : "Amount ($)"}
                    </label>

                    <input
                      value={bulkValue}
                      onChange={(event) =>
                        setBulkValue(
                          event.target.value
                        )
                      }
                      placeholder={
                        bulkMode ===
                          "current_percent"
                          ? "10"
                          : "5"
                      }
                      inputMode="decimal"
                      className={inputClass}
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={
                        applyBulkCost
                      }
                      disabled={
                        selectedIds.size ===
                        0 ||
                        !bulkValue.trim()
                      }
                      className={`${primaryButtonClass} w-full`}
                    >
                      Apply to Selection
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* CONTENT */}

        {isLoading ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500 dark:border-brand-500/20 dark:border-t-brand-400" />

              <p className="text-sm text-gray-500 dark:text-gray-400">
                Loading cost and margin
                data...
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {
                    filteredProducts.length
                  }{" "}
                  products
                </span>

                {selectedIds.size >
                  0 && (
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
                      {selectedIds.size}{" "}
                      selected
                    </span>
                  )}
              </div>

              {paginatedProducts.length >
                0 && (
                  <button
                    type="button"
                    onClick={
                      toggleCurrentPageSelection
                    }
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    {allCurrentPageSelected
                      ? "Unselect current page"
                      : "Select current page"}
                  </button>
                )}
            </div>

            {/* TABLE */}

            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="max-h-[700px] overflow-auto">
                <table className="min-w-max divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="sticky top-0 z-30 bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="sticky left-0 z-50 w-12 min-w-12 border-r border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
                        <input
                          type="checkbox"
                          checked={
                            allCurrentPageSelected
                          }
                          onChange={
                            toggleCurrentPageSelection
                          }
                          className="h-4 w-4 accent-brand-500"
                        />
                      </th>

                      <th className="sticky left-12 z-40 min-w-[145px] border-r border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                        SKU
                      </th>

                      <th className="sticky left-[193px] z-40 min-w-[250px] border-r border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                        Product
                      </th>

                      <th className="min-w-[100px] px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Stock
                      </th>

                      <th className="min-w-[150px] px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Cost
                      </th>

                      <th className="min-w-[145px] px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Min Margin
                      </th>

                      <th className="min-w-[120px] px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Health
                      </th>

                      {sortedPriceGroups.map(
                        (group) => (
                          <th
                            key={group.id}
                            className="min-w-[165px] px-4 py-3 text-left"
                          >
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getGroupBadgeClass(
                                group
                              )}`}
                            >
                              {group.name}
                            </span>
                          </th>
                        )
                      )}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
                    {paginatedProducts.length ===
                      0 ? (
                      <tr>
                        <td
                          colSpan={
                            7 +
                            sortedPriceGroups.length
                          }
                          className="px-6 py-14 text-center text-sm text-gray-500 dark:text-gray-400"
                        >
                          No products found.
                        </td>
                      </tr>
                    ) : (
                      paginatedProducts.map(
                        (product) => {
                          const selected =
                            selectedIds.has(
                              product.id
                            );

                          const stickyBg =
                            selected
                              ? "bg-brand-25 dark:bg-brand-500/[0.08]"
                              : "bg-white dark:bg-gray-900";

                          const stock =
                            stockTotals[
                            product.id
                            ] ?? 0;

                          const costRaw =
                            costValues[
                            product.id
                            ] ?? "";

                          const cost =
                            parseNumber(
                              costRaw
                            );

                          const costDirty =
                            normalizeNumber(
                              costRaw
                            ) !==
                            normalizeNumber(
                              originalCostValues[
                              product.id
                              ]
                            );

                          const override =
                            marginOverrides[
                            product.id
                            ] ?? "";

                          const overrideDirty =
                            normalizeNumber(
                              override
                            ) !==
                            normalizeNumber(
                              originalMarginOverrides[
                              product.id
                              ]
                            );

                          const effectiveMinimum =
                            getEffectiveMinMargin(
                              product.id
                            );

                          const productHealth =
                            getProductHealth(
                              product.id
                            );

                          const brand =
                            product.brand_id
                              ? brandMap.get(
                                product.brand_id
                              )
                              : null;

                          const category =
                            product.category_id
                              ? categoryMap.get(
                                product.category_id
                              )
                              : null;

                          return (
                            <tr
                              key={product.id}
                              className={
                                selected
                                  ? "bg-brand-25/60 dark:bg-brand-500/[0.05]"
                                  : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                              }
                            >
                              {/* SELECT */}

                              <td
                                className={`sticky left-0 z-20 border-r border-gray-100 px-3 py-3 text-center dark:border-gray-800 ${stickyBg}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    selected
                                  }
                                  onChange={() =>
                                    toggleProductSelection(
                                      product.id
                                    )
                                  }
                                  className="h-4 w-4 accent-brand-500"
                                />
                              </td>

                              {/* SKU */}

                              <td
                                className={`sticky left-12 z-20 min-w-[145px] border-r border-gray-100 px-4 py-3 dark:border-gray-800 ${stickyBg}`}
                              >
                                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                                  {product.sku}
                                </p>

                                {product.barcode && (
                                  <p className="mt-0.5 text-[11px] text-gray-400">
                                    {
                                      product.barcode
                                    }
                                  </p>
                                )}
                              </td>

                              {/* PRODUCT */}

                              <td
                                className={`sticky left-[193px] z-20 min-w-[250px] border-r border-gray-100 px-4 py-3 dark:border-gray-800 ${stickyBg}`}
                              >
                                <p className="max-w-[230px] truncate text-sm font-medium text-gray-800 dark:text-white/90">
                                  {product.name}
                                </p>

                                {(brand ||
                                  category) && (
                                    <p className="mt-1 text-[11px] text-gray-400">
                                      {brand}
                                      {brand &&
                                        category
                                        ? " • "
                                        : ""}
                                      {category}
                                    </p>
                                  )}
                              </td>

                              {/* STOCK */}

                              <td className="px-4 py-3 text-right">
                                <p
                                  className={`text-sm font-semibold ${stock > 0
                                    ? "text-success-700 dark:text-success-400"
                                    : "text-gray-400"
                                    }`}
                                >
                                  {formatStock(
                                    stock
                                  )}
                                </p>
                              </td>

                              {/* COST */}

                              <td className="px-3 py-2.5">
                                <div className="relative w-[135px]">
                                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-400">
                                    $
                                  </span>

                                  <input
                                    value={costRaw}
                                    onChange={(event) => {
                                      clearMessages();

                                      setCostValues(
                                        (current) => ({
                                          ...current,
                                          [product.id]:
                                            event.target
                                              .value,
                                        })
                                      );
                                    }}
                                    inputMode="decimal"
                                    placeholder="—"
                                    className={`h-10 w-full rounded-lg border py-2 pl-7 pr-3 text-right text-sm font-medium text-gray-800 shadow-theme-xs focus:outline-none focus:ring-3 dark:text-white/90 ${costDirty
                                      ? "border-brand-300 bg-brand-50 focus:ring-brand-500/10 dark:border-brand-500/50 dark:bg-brand-500/10"
                                      : "border-gray-300 bg-white focus:border-brand-300 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                                      }`}
                                  />

                                  {costDirty && (
                                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white dark:ring-gray-900" />
                                  )}
                                </div>
                              </td>

                              {/* MIN MARGIN */}

                              <td className="px-3 py-2.5">
                                <div>
                                  <div className="relative w-[115px]">
                                    <input
                                      value={
                                        override
                                      }
                                      onChange={(
                                        event
                                      ) => {
                                        clearMessages();

                                        setMarginOverrides(
                                          (
                                            current
                                          ) => ({
                                            ...current,
                                            [product.id]:
                                              event
                                                .target
                                                .value,
                                          })
                                        );
                                      }}
                                      inputMode="decimal"
                                      placeholder={`${defaultMarginNumber}`}
                                      className={`h-10 w-full rounded-lg border py-2 pl-3 pr-7 text-right text-sm text-gray-800 shadow-theme-xs focus:outline-none focus:ring-3 dark:text-white/90 ${overrideDirty
                                        ? "border-brand-300 bg-brand-50 focus:ring-brand-500/10 dark:border-brand-500/50 dark:bg-brand-500/10"
                                        : "border-gray-300 bg-white focus:border-brand-300 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                                        }`}
                                    />

                                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400">
                                      %
                                    </span>
                                  </div>

                                  <p className="mt-1 text-[10px] text-gray-400">
                                    {override.trim()
                                      ? "Custom"
                                      : `Global ${effectiveMinimum}%`}
                                  </p>
                                </div>
                              </td>

                              {/* HEALTH */}

                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${marginBadgeClass(
                                    productHealth
                                  )}`}
                                >
                                  {healthLabel(
                                    productHealth
                                  )}
                                </span>
                              </td>

                              {/* PRICE GROUP MARGINS */}

                              {sortedPriceGroups.map(
                                (group) => {
                                  const price =
                                    priceValues[
                                    makePriceKey(
                                      product.id,
                                      group.id
                                    )
                                    ];

                                  const margin =
                                    calculateMargin(
                                      price ??
                                      null,
                                      cost
                                    );

                                  const health =
                                    cost === null
                                      ? "missing_cost"
                                      : getMarginHealth(
                                        margin,
                                        effectiveMinimum,
                                        warningBufferNumber
                                      );

                                  return (
                                    <td
                                      key={
                                        group.id
                                      }
                                      className="px-4 py-3"
                                    >
                                      {price ===
                                        undefined ? (
                                        <div className="text-sm text-gray-400">
                                          —
                                        </div>
                                      ) : (
                                        <div>
                                          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                                            {formatMoney(
                                              price
                                            )}
                                          </p>

                                          {cost ===
                                            null ? (
                                            <span className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                                              No Cost
                                            </span>
                                          ) : margin ===
                                            null ? (
                                            <span className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                                              —
                                            </span>
                                          ) : (
                                            <span
                                              className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${marginBadgeClass(
                                                health
                                              )}`}
                                            >
                                              {margin.toFixed(
                                                1
                                              )}
                                              %
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  );
                                }
                              )}
                            </tr>
                          );
                        }
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PAGINATION */}

            <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Showing{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {startRow}–{endRow}
                </span>{" "}
                of{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {
                    filteredProducts.length
                  }
                </span>{" "}
                products
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(event) =>
                    setPageSize(
                      Number(
                        event.target.value
                      )
                    )
                  }
                  className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                >
                  {PAGE_SIZE_OPTIONS.map(
                    (size) => (
                      <option
                        key={size}
                        value={size}
                      >
                        {size} / page
                      </option>
                    )
                  )}
                </select>

                <button
                  type="button"
                  disabled={
                    currentPage <= 1
                  }
                  onClick={() =>
                    setCurrentPage(
                      (page) =>
                        Math.max(
                          1,
                          page - 1
                        )
                    )
                  }
                  className={
                    smallButtonClass
                  }
                >
                  Previous
                </button>

                <div className="flex h-9 min-w-[105px] items-center justify-center rounded-lg bg-gray-50 px-3 text-xs font-medium text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
                  {currentPage} /{" "}
                  {totalPages}
                </div>

                <button
                  type="button"
                  disabled={
                    currentPage >=
                    totalPages
                  }
                  onClick={() =>
                    setCurrentPage(
                      (page) =>
                        Math.min(
                          totalPages,
                          page + 1
                        )
                    )
                  }
                  className={
                    smallButtonClass
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: LookupRow[];
  allLabel: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className={selectClass}
      >
        <option value="">
          {allLabel}
        </option>

        {options.map((item) => (
          <option
            key={item.id}
            value={item.id}
          >
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleButton({
  label,
  open,
  onClick,
  badge,
  dirty = false,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
  badge?: number;
  dirty?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        open || badge || dirty
          ? "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 text-sm font-medium text-brand-700 shadow-theme-xs transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400"
          : secondaryButtonClass
      }
    >
      {label}

      {badge !== undefined && (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {badge}
        </span>
      )}

      {dirty && (
        <span className="h-2 w-2 rounded-full bg-brand-500" />
      )}

      <svg
        width="14"
        height="14"
        viewBox="0 0 20 20"
        fill="none"
        className={`transition-transform duration-200 ${open ? "rotate-180" : ""
          }`}
      >
        <path
          d="M5 7.5L10 12.5L15 7.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function SummaryCard({
  label,
  value,
  type = "default",
}: {
  label: string;
  value: number;
  type?:
  | "default"
  | "success"
  | "warning"
  | "error";
}) {
  const classes =
    type === "success"
      ? "border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10"
      : type === "warning"
        ? "border-warning-200 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/10"
        : type === "error"
          ? "border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/10"
          : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]";

  const text =
    type === "success"
      ? "text-success-700 dark:text-success-400"
      : type === "warning"
        ? "text-warning-700 dark:text-warning-400"
        : type === "error"
          ? "text-error-700 dark:text-error-400"
          : "text-gray-800 dark:text-white/90";

  return (
    <div
      className={`rounded-xl border p-4 ${classes}`}
    >
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </p>

      <p
        className={`mt-1 text-xl font-semibold ${text}`}
      >
        {value}
      </p>
    </div>
  );
}