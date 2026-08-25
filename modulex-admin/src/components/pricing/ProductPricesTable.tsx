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

type StockTotal = {
  product_id: string;
  quantity: string | number;
  reserved_quantity: string | number;
  available_quantity: string | number;
};

type DirtyChange = {
  productId: string;
  priceGroupId: string;
  rawAmount: string;
};

type StockFilter =
  | "all"
  | "in_stock"
  | "out_of_stock";

type BulkMode =
  | "source_percent"
  | "current_percent"
  | "current_amount"
  | "set_amount";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs transition placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-500 dark:focus:border-brand-500";

const selectClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs transition focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-500";

const primaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 hover:text-gray-800 focus:outline-none focus:ring-3 focus:ring-gray-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05] dark:hover:text-white";

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
  priceGroupId: string
) {
  return `${productId}:${priceGroupId}`;
}

function formatAmountForInput(
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

function normalizeComparablePrice(
  value: string | undefined
) {
  const raw = (value ?? "")
    .trim()
    .replace(",", ".");

  if (!raw) {
    return "";
  }

  const number = Number(raw);

  if (!Number.isFinite(number)) {
    return `invalid:${raw}`;
  }

  return number.toFixed(4);
}

function parsePrice(
  value: string | undefined
) {
  const raw = (value ?? "")
    .trim()
    .replace(",", ".");

  if (!raw) {
    return null;
  }

  const number = Number(raw);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
}

function formatCurrency(
  value: string
) {
  const number = Number(
    value.replace(",", ".")
  );

  if (!Number.isFinite(number)) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  ).format(number);
}

function formatStock(
  value:
    | string
    | number
    | null
    | undefined
) {
  return Number(value ?? 0).toLocaleString(
    "en-US",
    {
      maximumFractionDigits: 2,
    }
  );
}

export default function ProductPricesTable() {
  const [products, setProducts] =
    useState<ProductRow[]>([]);

  const [priceGroups, setPriceGroups] =
    useState<PriceGroup[]>([]);

  const [brands, setBrands] =
    useState<LookupRow[]>([]);

  const [categories, setCategories] =
    useState<LookupRow[]>([]);

  const [stockTotals, setStockTotals] =
    useState<Record<string, number>>({});

  const [priceValues, setPriceValues] =
    useState<Record<string, string>>({});

  const [
    originalPriceValues,
    setOriginalPriceValues,
  ] = useState<Record<string, string>>({});

  const [selectedIds, setSelectedIds] =
    useState<Set<string>>(new Set());

  const [canManage, setCanManage] =
    useState(false);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSaving, setIsSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [
    successMessage,
    setSuccessMessage,
  ] = useState<string | null>(null);

  /*
   * Collapsible panels
   */

  const [filtersOpen, setFiltersOpen] =
    useState(false);

  const [bulkOpen, setBulkOpen] =
    useState(false);

  /*
   * Filters
   */

  const [searchQuery, setSearchQuery] =
    useState("");

  const [brandFilter, setBrandFilter] =
    useState("");

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState("");

  const [statusFilter, setStatusFilter] =
    useState<"all" | ProductStatus>(
      "all"
    );

  const [stockFilter, setStockFilter] =
    useState<StockFilter>("all");

  /*
   * Pagination
   */

  const [currentPage, setCurrentPage] =
    useState(1);

  const [pageSize, setPageSize] =
    useState(50);

  /*
   * Bulk pricing
   */

  const [
    bulkTargetGroupId,
    setBulkTargetGroupId,
  ] = useState("");

  const [
    bulkSourceGroupId,
    setBulkSourceGroupId,
  ] = useState("");

  const [bulkMode, setBulkMode] =
    useState<BulkMode>(
      "source_percent"
    );

  const [bulkValue, setBulkValue] =
    useState("");

  const currencyCode = "USD";

  /*
   * Lookup maps
   */

  const brandMap = useMemo(() => {
    return new Map(
      brands.map((brand) => [
        brand.id,
        brand.name,
      ])
    );
  }, [brands]);

  const categoryMap = useMemo(() => {
    return new Map(
      categories.map((category) => [
        category.id,
        category.name,
      ])
    );
  }, [categories]);

  /*
   * Price groups
   */

  const sortedPriceGroups = useMemo(() => {
    return [...priceGroups].sort(
      (a, b) => {
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
      }
    );
  }, [priceGroups]);

  /*
   * Default bulk groups
   */

  useEffect(() => {
    if (
      !sortedPriceGroups.length
    ) {
      return;
    }

    setBulkSourceGroupId(
      (current) => {
        if (
          current &&
          sortedPriceGroups.some(
            (group) =>
              group.id === current
          )
        ) {
          return current;
        }

        return (
          sortedPriceGroups.find(
            (group) =>
              group.is_base_price
          )?.id ??
          sortedPriceGroups[0].id
        );
      }
    );

    setBulkTargetGroupId(
      (current) => {
        if (
          current &&
          sortedPriceGroups.some(
            (group) =>
              group.id === current
          )
        ) {
          return current;
        }

        return (
          sortedPriceGroups.find(
            (group) =>
              !group.is_base_price
          )?.id ??
          sortedPriceGroups[0].id
        );
      }
    );
  }, [sortedPriceGroups]);

  /*
   * Active filter count
   */

  const activeFilterCount =
    useMemo(() => {
      let count = 0;

      if (searchQuery.trim()) {
        count += 1;
      }

      if (brandFilter) {
        count += 1;
      }

      if (categoryFilter) {
        count += 1;
      }

      if (
        statusFilter !== "all"
      ) {
        count += 1;
      }

      if (
        stockFilter !== "all"
      ) {
        count += 1;
      }

      return count;
    }, [
      searchQuery,
      brandFilter,
      categoryFilter,
      statusFilter,
      stockFilter,
    ]);

  /*
   * Filter products
   */

  const filteredProducts = useMemo(() => {
    const query = searchQuery
      .trim()
      .toLowerCase();

    return products.filter(
      (product) => {
        const brandName =
          product.brand_id
            ? brandMap.get(
              product.brand_id
            ) ?? ""
            : "";

        const categoryName =
          product.category_id
            ? categoryMap.get(
              product.category_id
            ) ?? ""
            : "";

        const availableStock =
          stockTotals[
          product.id
          ] ?? 0;

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
          brandName
            .toLowerCase()
            .includes(query) ||
          categoryName
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
          (stockFilter ===
            "in_stock" &&
            availableStock > 0) ||
          (stockFilter ===
            "out_of_stock" &&
            availableStock <= 0);

        return (
          matchesSearch &&
          matchesBrand &&
          matchesCategory &&
          matchesStatus &&
          matchesStock
        );
      }
    );
  }, [
    products,
    searchQuery,
    brandFilter,
    categoryFilter,
    statusFilter,
    stockFilter,
    brandMap,
    categoryMap,
    stockTotals,
  ]);

  /*
   * Pagination
   */

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

  /*
   * Price changes
   */

  const dirtyChanges =
    useMemo<DirtyChange[]>(() => {
      const changes: DirtyChange[] =
        [];

      for (const product of products) {
        for (
          const group
          of sortedPriceGroups
        ) {
          const key = makePriceKey(
            product.id,
            group.id
          );

          const current =
            normalizeComparablePrice(
              priceValues[key]
            );

          const original =
            normalizeComparablePrice(
              originalPriceValues[
              key
              ]
            );

          if (
            current !== original
          ) {
            changes.push({
              productId:
                product.id,

              priceGroupId:
                group.id,

              rawAmount:
                priceValues[key] ??
                "",
            });
          }
        }
      }

      return changes;
    }, [
      products,
      sortedPriceGroups,
      priceValues,
      originalPriceValues,
    ]);

  const dirtyCount =
    dirtyChanges.length;

  /*
   * Selection
   */

  const selectedCount =
    selectedIds.size;

  const currentPageIds =
    paginatedProducts.map(
      (product) => product.id
    );

  const allCurrentPageSelected =
    currentPageIds.length > 0 &&
    currentPageIds.every((id) =>
      selectedIds.has(id)
    );

  /*
   * Statistics
   */

  const totalPossiblePrices =
    products.length *
    sortedPriceGroups.length;

  const filledPriceCount =
    useMemo(() => {
      let count = 0;

      for (
        const product
        of products
      ) {
        for (
          const group
          of sortedPriceGroups
        ) {
          const key =
            makePriceKey(
              product.id,
              group.id
            );

          if (
            normalizeComparablePrice(
              originalPriceValues[
              key
              ]
            )
          ) {
            count += 1;
          }
        }
      }

      return count;
    }, [
      products,
      sortedPriceGroups,
      originalPriceValues,
    ]);

  const missingPriceCount =
    Math.max(
      0,
      totalPossiblePrices -
      filledPriceCount
    );

  /*
   * Fetch current price rows
   */

  async function fetchAllCurrentPrices() {
    const allRows: ProductPrice[] =
      [];

    const batchSize = 1000;

    let from = 0;

    while (true) {
      const { data, error } =
        await supabase
          .from(
            "product_prices"
          )
          .select(
            `
              id,
              product_id,
              price_group_id,
              amount,
              currency_code
            `
          )
          .eq(
            "is_active",
            true
          )
          .is(
            "valid_to",
            null
          )
          .eq(
            "currency_code",
            currencyCode
          )
          .range(
            from,
            from +
            batchSize -
            1
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

      allRows.push(
        ...rows
      );

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

  /*
   * Load
   */

  async function loadData() {
    setIsLoading(true);
    setErrorMessage(null);

    const [
      productsResult,
      groupsResult,
      brandsResult,
      categoriesResult,
      stockResult,
      pricesResult,
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
        .order("sku", {
          ascending: true,
        }),

      supabase
        .from(
          "price_groups"
        )
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
        .eq(
          "is_active",
          true
        )
        .order(
          "sort_order",
          {
            ascending: true,
          }
        ),

      supabase
        .from(
          "product_brands"
        )
        .select("id, name")
        .order("name"),

      supabase
        .from(
          "product_categories"
        )
        .select("id, name")
        .order("name"),

      supabase.rpc(
        "get_product_stock_totals"
      ),

      fetchAllCurrentPrices(),
    ]);

    const firstError =
      productsResult.error ||
      groupsResult.error ||
      brandsResult.error ||
      categoriesResult.error ||
      stockResult.error ||
      pricesResult.error;

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

    const loadedGroups =
      (groupsResult.data ??
        []) as PriceGroup[];

    const loadedBrands =
      (brandsResult.data ??
        []) as LookupRow[];

    const loadedCategories =
      (categoriesResult.data ??
        []) as LookupRow[];

    const loadedStocks =
      (stockResult.data ??
        []) as StockTotal[];

    const loadedPrices =
      pricesResult.data;

    const newPriceMap: Record<
      string,
      string
    > = {};

    const newStockMap: Record<
      string,
      number
    > = {};

    for (
      const price
      of loadedPrices
    ) {
      const key =
        makePriceKey(
          price.product_id,
          price.price_group_id
        );

      newPriceMap[key] =
        formatAmountForInput(
          price.amount
        );
    }

    for (
      const stock
      of loadedStocks
    ) {
      newStockMap[
        stock.product_id
      ] = Number(
        stock.available_quantity ??
        0
      );
    }

    setProducts(
      loadedProducts
    );

    setPriceGroups(
      loadedGroups
    );

    setBrands(
      loadedBrands
    );

    setCategories(
      loadedCategories
    );

    setStockTotals(
      newStockMap
    );

    setOriginalPriceValues({
      ...newPriceMap,
    });

    setPriceValues({
      ...newPriceMap,
    });

    setIsLoading(false);
  }

  useEffect(() => {
    async function initialize() {
      const { profile } =
        await getCurrentProfile();

      setCanManage(
        profile?.role ===
        "super_admin" ||
        profile?.role ===
        "admin"
      );

      await loadData();
    }

    initialize();
  }, []);

  /*
   * Pagination resets
   */

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    brandFilter,
    categoryFilter,
    statusFilter,
    stockFilter,
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

  /*
   * Unsaved navigation protection
   */

  useEffect(() => {
    if (
      dirtyCount === 0
    ) {
      return;
    }

    function handleBeforeUnload(
      event: BeforeUnloadEvent
    ) {
      event.preventDefault();

      event.returnValue =
        "";
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
  }, [dirtyCount]);

  function clearMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function getPriceGroupBadgeClass(
    group: PriceGroup
  ) {
    if (
      group.is_base_price
    ) {
      return priceGroupBadgeClasses.brand;
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

  /*
   * Edit price
   */

  function handlePriceChange(
    productId: string,
    priceGroupId: string,
    value: string
  ) {
    clearMessages();

    const key =
      makePriceKey(
        productId,
        priceGroupId
      );

    setPriceValues(
      (current) => ({
        ...current,
        [key]: value,
      })
    );
  }

  function isCellDirty(
    productId: string,
    priceGroupId: string
  ) {
    const key =
      makePriceKey(
        productId,
        priceGroupId
      );

    return (
      normalizeComparablePrice(
        priceValues[key]
      ) !==
      normalizeComparablePrice(
        originalPriceValues[
        key
        ]
      )
    );
  }

  /*
   * Selection
   */

  function toggleProductSelection(
    productId: string
  ) {
    setSelectedIds(
      (current) => {
        const next =
          new Set(current);

        if (
          next.has(
            productId
          )
        ) {
          next.delete(
            productId
          );
        } else {
          next.add(
            productId
          );
        }

        return next;
      }
    );
  }

  function toggleCurrentPageSelection() {
    setSelectedIds(
      (current) => {
        const next =
          new Set(current);

        if (
          allCurrentPageSelected
        ) {
          currentPageIds.forEach(
            (id) =>
              next.delete(id)
          );
        } else {
          currentPageIds.forEach(
            (id) =>
              next.add(id)
          );
        }

        return next;
      }
    );
  }

  function selectAllFiltered() {
    setSelectedIds(
      new Set(
        filteredProducts.map(
          (product) =>
            product.id
        )
      )
    );
  }

  function clearSelection() {
    setSelectedIds(
      new Set()
    );
  }

  /*
   * Bulk pricing
   */

  function applyBulkPricing() {
    clearMessages();

    if (
      selectedIds.size ===
      0
    ) {
      setErrorMessage(
        "Select at least one product."
      );

      return;
    }

    if (
      !bulkTargetGroupId
    ) {
      setErrorMessage(
        "Select a target price group."
      );

      return;
    }

    const parsedValue =
      Number(
        bulkValue
          .trim()
          .replace(",", ".")
      );

    if (
      !Number.isFinite(
        parsedValue
      )
    ) {
      setErrorMessage(
        "Enter a valid bulk adjustment value."
      );

      return;
    }

    if (
      bulkMode ===
      "source_percent" &&
      !bulkSourceGroupId
    ) {
      setErrorMessage(
        "Select a source price group."
      );

      return;
    }

    if (
      bulkMode ===
      "source_percent" &&
      bulkSourceGroupId ===
      bulkTargetGroupId
    ) {
      setErrorMessage(
        "Source and target groups must be different."
      );

      return;
    }

    let applied = 0;
    let skipped = 0;

    const nextValues = {
      ...priceValues,
    };

    for (
      const productId
      of selectedIds
    ) {
      const targetKey =
        makePriceKey(
          productId,
          bulkTargetGroupId
        );

      let result:
        | number
        | null = null;

      if (
        bulkMode ===
        "source_percent"
      ) {
        const sourceKey =
          makePriceKey(
            productId,
            bulkSourceGroupId
          );

        const sourceValue =
          parsePrice(
            priceValues[
            sourceKey
            ]
          );

        if (
          sourceValue ===
          null
        ) {
          skipped += 1;
          continue;
        }

        result =
          sourceValue *
          (1 +
            parsedValue /
            100);
      }

      if (
        bulkMode ===
        "current_percent"
      ) {
        const currentValue =
          parsePrice(
            priceValues[
            targetKey
            ]
          );

        if (
          currentValue ===
          null
        ) {
          skipped += 1;
          continue;
        }

        result =
          currentValue *
          (1 +
            parsedValue /
            100);
      }

      if (
        bulkMode ===
        "current_amount"
      ) {
        const currentValue =
          parsePrice(
            priceValues[
            targetKey
            ]
          );

        if (
          currentValue ===
          null
        ) {
          skipped += 1;
          continue;
        }

        result =
          currentValue +
          parsedValue;
      }

      if (
        bulkMode ===
        "set_amount"
      ) {
        result =
          parsedValue;
      }

      if (
        result === null ||
        !Number.isFinite(
          result
        ) ||
        result < 0
      ) {
        skipped += 1;
        continue;
      }

      nextValues[
        targetKey
      ] = result.toFixed(
        2
      );

      applied += 1;
    }

    setPriceValues(
      nextValues
    );

    if (
      applied === 0
    ) {
      setErrorMessage(
        "No prices could be updated. Required source prices may be missing."
      );

      return;
    }

    setSuccessMessage(
      skipped > 0
        ? `Bulk preview applied to ${applied} products. ${skipped} products were skipped.`
        : `Bulk preview applied to ${applied} products. Review the highlighted prices and click Save Changes.`
    );
  }

  /*
   * Reset price changes
   */

  function resetChanges() {
    setPriceValues({
      ...originalPriceValues,
    });

    clearMessages();
  }

  /*
   * Save
   */

  async function saveChanges() {
    if (!dirtyCount) {
      return;
    }

    clearMessages();

    const payload: {
      product_id: string;
      price_group_id: string;
      amount:
      | number
      | null;
    }[] = [];

    for (
      const change
      of dirtyChanges
    ) {
      const raw =
        change.rawAmount
          .trim()
          .replace(",", ".");

      let amount:
        | number
        | null = null;

      if (raw) {
        const parsed =
          Number(raw);

        if (
          !Number.isFinite(
            parsed
          ) ||
          parsed < 0
        ) {
          const product =
            products.find(
              (item) =>
                item.id ===
                change.productId
            );

          const group =
            sortedPriceGroups.find(
              (item) =>
                item.id ===
                change.priceGroupId
            );

          setErrorMessage(
            `Invalid price for ${product?.sku ??
            "product"
            } / ${group?.name ??
            "price group"
            }.`
          );

          return;
        }

        amount = Number(
          parsed.toFixed(4)
        );
      }

      payload.push({
        product_id:
          change.productId,

        price_group_id:
          change.priceGroupId,

        amount,
      });
    }

    setIsSaving(true);

    const {
      data,
      error,
    } = await supabase.rpc(
      "set_product_prices_bulk",
      {
        p_changes:
          payload,

        p_currency_code:
          currencyCode,
      }
    );

    if (error) {
      setErrorMessage(
        error.message
      );

      setIsSaving(false);

      return;
    }

    const savedCount =
      typeof data ===
        "number"
        ? data
        : dirtyCount;

    await loadData();

    setSuccessMessage(
      `${savedCount} price change${savedCount === 1
        ? ""
        : "s"
      } saved successfully.`
    );

    setIsSaving(false);
  }

  function clearFilters() {
    setSearchQuery("");
    setBrandFilter("");
    setCategoryFilter("");
    setStatusFilter("all");
    setStockFilter("all");
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
      currentPage *
      pageSize,
      filteredProducts.length
    );

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      {/* Header */}

      <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-800 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Product Prices
              </h3>

              <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                USD
              </span>
            </div>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage product prices
              across active customer
              price groups.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filters toggle */}

            <button
              type="button"
              onClick={() =>
                setFiltersOpen(
                  (current) =>
                    !current
                )
              }
              className={
                filtersOpen ||
                  activeFilterCount >
                  0
                  ? "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 text-sm font-medium text-brand-700 shadow-theme-xs transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400"
                  : secondaryButtonClass
              }
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 6H20M7 12H17M10 18H14"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>

              Filters

              {activeFilterCount >
                0 && (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {
                      activeFilterCount
                    }
                  </span>
                )}

              <Chevron
                open={
                  filtersOpen
                }
              />
            </button>

            {/* Bulk toggle */}

            {canManage && (
              <button
                type="button"
                onClick={() =>
                  setBulkOpen(
                    (current) =>
                      !current
                  )
                }
                className={
                  bulkOpen
                    ? "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 text-sm font-medium text-brand-700 shadow-theme-xs transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400"
                    : secondaryButtonClass
                }
              >
                Bulk Pricing

                {selectedCount >
                  0 && (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {
                        selectedCount
                      }
                    </span>
                  )}

                <Chevron
                  open={
                    bulkOpen
                  }
                />
              </button>
            )}

            {/* Reset */}

            {canManage &&
              dirtyCount > 0 && (
                <button
                  type="button"
                  onClick={
                    resetChanges
                  }
                  disabled={
                    isSaving
                  }
                  className={
                    secondaryButtonClass
                  }
                >
                  Reset
                </button>
              )}

            {/* Save */}

            {canManage && (
              <button
                type="button"
                onClick={
                  saveChanges
                }
                disabled={
                  isSaving ||
                  dirtyCount ===
                  0
                }
                className={
                  primaryButtonClass
                }
              >
                {isSaving
                  ? "Saving..."
                  : dirtyCount >
                    0
                    ? `Save Changes (${dirtyCount})`
                    : "Save Changes"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {/* Messages */}

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

        {dirtyCount > 0 && (
          <div className="mb-5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400">
            {dirtyCount} unsaved{" "}
            {dirtyCount === 1
              ? "price change"
              : "price changes"}
            .
          </div>
        )}

        {/* Summary */}

        {!isLoading && (
          <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <SummaryCard
              title="Products"
              value={
                products.length
              }
            />

            <SummaryCard
              title="Price Groups"
              value={
                sortedPriceGroups.length
              }
            />

            <SummaryCard
              title="Prices Entered"
              value={
                filledPriceCount
              }
              variant="success"
            />

            <SummaryCard
              title="Missing Prices"
              value={
                missingPriceCount
              }
              variant="warning"
            />
          </div>
        )}

        {/* Collapsible Filters */}

        {filtersOpen && (
          <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  Filters
                </h4>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Filter products before
                  reviewing or selecting
                  them.
                </p>
              </div>

              {activeFilterCount >
                0 && (
                  <button
                    type="button"
                    onClick={
                      clearFilters
                    }
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    Clear All
                  </button>
                )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <div className="xl:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Search Products
                </label>

                <input
                  value={
                    searchQuery
                  }
                  onChange={(
                    event
                  ) =>
                    setSearchQuery(
                      event.target
                        .value
                    )
                  }
                  placeholder="SKU, barcode, product, brand..."
                  className={
                    inputClass
                  }
                />
              </div>

              <FilterSelect
                label="Brand"
                value={
                  brandFilter
                }
                onChange={
                  setBrandFilter
                }
                options={
                  brands
                }
                allLabel="All Brands"
              />

              <FilterSelect
                label="Category"
                value={
                  categoryFilter
                }
                onChange={
                  setCategoryFilter
                }
                options={
                  categories
                }
                allLabel="All Categories"
              />

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Stock
                </label>

                <select
                  value={
                    stockFilter
                  }
                  onChange={(
                    event
                  ) =>
                    setStockFilter(
                      event.target
                        .value as StockFilter
                    )
                  }
                  className={
                    selectClass
                  }
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
                  Status
                </label>

                <select
                  value={
                    statusFilter
                  }
                  onChange={(
                    event
                  ) =>
                    setStatusFilter(
                      event.target
                        .value as
                      | "all"
                      | ProductStatus
                    )
                  }
                  className={
                    selectClass
                  }
                >
                  <option value="all">
                    All Statuses
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

        {/* Collapsible Bulk Pricing */}

        {canManage &&
          bulkOpen &&
          !isLoading && (
            <div className="mb-5 overflow-hidden rounded-xl border border-brand-200 bg-brand-25 dark:border-brand-500/20 dark:bg-brand-500/[0.06]">
              <div className="flex flex-col gap-3 border-b border-brand-100 px-4 py-4 dark:border-brand-500/10 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    Bulk Pricing
                  </h4>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {
                      selectedCount
                    }{" "}
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
                    Select All Filtered
                    (
                    {
                      filteredProducts.length
                    }
                    )
                  </button>

                  {selectedCount >
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
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Target Group
                    </label>

                    <select
                      value={
                        bulkTargetGroupId
                      }
                      onChange={(
                        event
                      ) =>
                        setBulkTargetGroupId(
                          event.target
                            .value
                        )
                      }
                      className={
                        selectClass
                      }
                    >
                      {sortedPriceGroups.map(
                        (
                          group
                        ) => (
                          <option
                            key={
                              group.id
                            }
                            value={
                              group.id
                            }
                          >
                            {
                              group.name
                            }
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Operation
                    </label>

                    <select
                      value={
                        bulkMode
                      }
                      onChange={(
                        event
                      ) =>
                        setBulkMode(
                          event.target
                            .value as BulkMode
                        )
                      }
                      className={
                        selectClass
                      }
                    >
                      <option value="source_percent">
                        From Another
                        Group %
                      </option>

                      <option value="current_percent">
                        Adjust Current
                        %
                      </option>

                      <option value="current_amount">
                        Adjust Current
                        $
                      </option>

                      <option value="set_amount">
                        Set Exact Price
                      </option>
                    </select>
                  </div>

                  {bulkMode ===
                    "source_percent" && (
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Source Group
                        </label>

                        <select
                          value={
                            bulkSourceGroupId
                          }
                          onChange={(
                            event
                          ) =>
                            setBulkSourceGroupId(
                              event.target
                                .value
                            )
                          }
                          className={
                            selectClass
                          }
                        >
                          {sortedPriceGroups.map(
                            (
                              group
                            ) => (
                              <option
                                key={
                                  group.id
                                }
                                value={
                                  group.id
                                }
                              >
                                {
                                  group.name
                                }
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    )}

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                      {bulkMode ===
                        "set_amount"
                        ? "Price ($)"
                        : bulkMode ===
                          "current_amount"
                          ? "Amount ($)"
                          : "Percentage (%)"}
                    </label>

                    <input
                      value={
                        bulkValue
                      }
                      onChange={(
                        event
                      ) =>
                        setBulkValue(
                          event.target
                            .value
                        )
                      }
                      placeholder={
                        bulkMode ===
                          "source_percent"
                          ? "-15"
                          : "0"
                      }
                      inputMode="decimal"
                      className={
                        inputClass
                      }
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={
                        applyBulkPricing
                      }
                      disabled={
                        selectedCount ===
                        0 ||
                        !bulkValue.trim()
                      }
                      className={`${primaryButtonClass} w-full`}
                    >
                      Apply to Selection
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-brand-100 bg-white/70 px-3 py-2.5 text-xs leading-5 text-gray-600 dark:border-brand-500/10 dark:bg-white/[0.03] dark:text-gray-400">
                  Example: Target{" "}
                  <strong>
                    Silver
                  </strong>
                  , Source{" "}
                  <strong>
                    Liste Fiyatı
                  </strong>
                  , Percentage{" "}
                  <strong>
                    -15%
                  </strong>{" "}
                  makes Silver 15%
                  cheaper than the
                  list price.
                </div>
              </div>
            </div>
          )}

        {/* Loading */}

        {isLoading ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500 dark:border-brand-500/20 dark:border-t-brand-400" />

              <p className="text-sm text-gray-500 dark:text-gray-400">
                Loading product
                prices...
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Table toolbar */}

            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {
                    filteredProducts.length
                  }{" "}
                  products
                </span>

                {selectedCount >
                  0 && (
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
                      {
                        selectedCount
                      }{" "}
                      selected
                    </span>
                  )}
              </div>

              {canManage &&
                paginatedProducts.length >
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

            {/* Grid */}

            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="max-h-[680px] overflow-auto">
                <table className="min-w-max divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="sticky top-0 z-30 bg-gray-50 dark:bg-gray-900">
                    <tr>
                      {canManage && (
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
                      )}

                      <th
                        className={`sticky z-40 min-w-[150px] border-r border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 ${canManage
                          ? "left-12"
                          : "left-0"
                          }`}
                      >
                        SKU
                      </th>

                      <th
                        className={`sticky z-40 min-w-[260px] border-r border-gray-200 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 ${canManage
                          ? "left-[198px]"
                          : "left-[150px]"
                          }`}
                      >
                        Product
                      </th>

                      <th className="min-w-[115px] px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Stock
                      </th>

                      {sortedPriceGroups.map(
                        (
                          group
                        ) => (
                          <th
                            key={
                              group.id
                            }
                            className="min-w-[165px] px-4 py-3 text-left"
                          >
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getPriceGroupBadgeClass(
                                group
                              )}`}
                            >
                              {
                                group.name
                              }
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
                            sortedPriceGroups.length +
                            (canManage
                              ? 4
                              : 3)
                          }
                          className="px-6 py-14 text-center text-sm text-gray-500"
                        >
                          No products
                          found.
                        </td>
                      </tr>
                    ) : (
                      paginatedProducts.map(
                        (
                          product
                        ) => {
                          const stock =
                            stockTotals[
                            product.id
                            ] ?? 0;

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

                          const selected =
                            selectedIds.has(
                              product.id
                            );

                          const stickyBg =
                            selected
                              ? "bg-brand-25 dark:bg-brand-500/[0.08]"
                              : "bg-white dark:bg-gray-900";

                          return (
                            <tr
                              key={
                                product.id
                              }
                              className={
                                selected
                                  ? "bg-brand-25/60 dark:bg-brand-500/[0.05]"
                                  : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                              }
                            >
                              {canManage && (
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
                              )}

                              <td
                                className={`sticky z-20 min-w-[150px] border-r border-gray-100 px-4 py-3 dark:border-gray-800 ${canManage
                                  ? "left-12"
                                  : "left-0"
                                  } ${stickyBg}`}
                              >
                                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                                  {
                                    product.sku
                                  }
                                </p>

                                {product.barcode && (
                                  <p className="mt-0.5 text-[11px] text-gray-400">
                                    {
                                      product.barcode
                                    }
                                  </p>
                                )}
                              </td>

                              <td
                                className={`sticky z-20 min-w-[260px] border-r border-gray-100 px-4 py-3 dark:border-gray-800 ${canManage
                                  ? "left-[198px]"
                                  : "left-[150px]"
                                  } ${stickyBg}`}
                              >
                                <p className="max-w-[240px] truncate text-sm font-medium text-gray-800 dark:text-white/90">
                                  {
                                    product.name
                                  }
                                </p>

                                {(brand ||
                                  category) && (
                                    <p className="mt-1 text-[11px] text-gray-400">
                                      {brand}

                                      {brand &&
                                        category
                                        ? " • "
                                        : ""}

                                      {
                                        category
                                      }
                                    </p>
                                  )}
                              </td>

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

                                <span
                                  className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${stock > 0
                                    ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                                    : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                                    }`}
                                >
                                  {stock > 0
                                    ? "In Stock"
                                    : "Out of Stock"}
                                </span>
                              </td>

                              {sortedPriceGroups.map(
                                (
                                  group
                                ) => {
                                  const key =
                                    makePriceKey(
                                      product.id,
                                      group.id
                                    );

                                  const value =
                                    priceValues[
                                    key
                                    ] ?? "";

                                  const dirty =
                                    isCellDirty(
                                      product.id,
                                      group.id
                                    );

                                  return (
                                    <td
                                      key={
                                        group.id
                                      }
                                      className="px-3 py-2.5"
                                    >
                                      {canManage ? (
                                        <div className="relative min-w-[140px]">
                                          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-gray-400">
                                            $
                                          </span>

                                          <input
                                            value={
                                              value
                                            }
                                            onChange={(
                                              event
                                            ) =>
                                              handlePriceChange(
                                                product.id,
                                                group.id,
                                                event.target.value
                                              )
                                            }
                                            inputMode="decimal"
                                            placeholder="—"
                                            disabled={
                                              isSaving
                                            }
                                            className={`h-10 w-[140px] rounded-lg border py-2 pl-7 pr-3 text-right text-sm font-medium text-gray-800 shadow-theme-xs transition focus:outline-none focus:ring-3 dark:text-white/90 ${dirty
                                              ? "border-brand-300 bg-brand-50 focus:ring-brand-500/10 dark:border-brand-500/50 dark:bg-brand-500/10"
                                              : "border-gray-300 bg-white focus:border-brand-300 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                                              }`}
                                          />

                                          {dirty && (
                                            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white dark:ring-gray-900" />
                                          )}
                                        </div>
                                      ) : value ? (
                                        <div className="min-w-[140px] text-right text-sm font-semibold text-gray-800 dark:text-white/90">
                                          {formatCurrency(
                                            value
                                          )}
                                        </div>
                                      ) : (
                                        <div className="min-w-[140px] text-right text-sm text-gray-400">
                                          —
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

            {/* Pagination */}

            <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Showing{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {startRow}–
                  {endRow}
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
                  value={
                    pageSize
                  }
                  onChange={(
                    event
                  ) =>
                    setPageSize(
                      Number(
                        event.target
                          .value
                      )
                    )
                  }
                  className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                >
                  {PAGE_SIZE_OPTIONS.map(
                    (
                      size
                    ) => (
                      <option
                        key={
                          size
                        }
                        value={
                          size
                        }
                      >
                        {size} /
                        page
                      </option>
                    )
                  )}
                </select>

                <button
                  type="button"
                  disabled={
                    currentPage <=
                    1
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

/*
 * Shared filter select
 */

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
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
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        className={
          selectClass
        }
      >
        <option value="">
          {allLabel}
        </option>

        {options.map(
          (item) => (
            <option
              key={
                item.id
              }
              value={
                item.id
              }
            >
              {item.name}
            </option>
          )
        )}
      </select>
    </div>
  );
}

/*
 * Summary card
 */

function SummaryCard({
  title,
  value,
  variant = "default",
}: {
  title: string;
  value: number;
  variant?:
  | "default"
  | "success"
  | "warning";
}) {
  if (
    variant === "success"
  ) {
    return (
      <div className="rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-500/30 dark:bg-success-500/10">
        <p className="text-xs font-medium text-success-600 dark:text-success-400">
          {title}
        </p>

        <p className="mt-1 text-xl font-semibold text-success-700 dark:text-success-400">
          {value}
        </p>
      </div>
    );
  }

  if (
    variant === "warning"
  ) {
    return (
      <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-500/30 dark:bg-warning-500/10">
        <p className="text-xs font-medium text-warning-700 dark:text-warning-400">
          {title}
        </p>

        <p className="mt-1 text-xl font-semibold text-warning-700 dark:text-warning-400">
          {value}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {title}
      </p>

      <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

/*
 * Small collapse arrow
 */

function Chevron({
  open,
}: {
  open: boolean;
}) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      className={`transition-transform duration-200 ${open
        ? "rotate-180"
        : ""
        }`}
      aria-hidden="true"
    >
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}