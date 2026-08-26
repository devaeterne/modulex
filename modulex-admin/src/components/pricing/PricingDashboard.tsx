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
};

type ProductCost = {
  id: string;
  product_id: string;
  amount: string | number;
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
  default_min_margin_percent: string | number;
  warning_margin_buffer_percent: string | number;
};

type StockInfo = {
  quantity: number;
  available: number;
};

type StockFilter =
  | "all"
  | "in_stock"
  | "out_of_stock";

type MarginHealth =
  | "healthy"
  | "warning"
  | "critical"
  | "loss"
  | "missing_cost"
  | "no_price";

type RiskRow = {
  product: ProductRow;
  group: PriceGroup;
  cost: number;
  price: number;
  margin: number;
  stock: number;
  minMargin: number;
};

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs transition placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-500";

const selectClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs transition focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 focus:outline-none focus:ring-3 focus:ring-gray-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";

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

function formatNumber(
  value: number
) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMoney(
  value: number
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMoneyDetailed(
  value: number
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function calculateMargin(
  price: number | undefined,
  cost: number | undefined
) {
  if (
    price === undefined ||
    cost === undefined ||
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
  minimum: number,
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
    minimum - warningBuffer
  ) {
    return "critical";
  }

  if (margin < minimum) {
    return "warning";
  }

  return "healthy";
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

function healthBadgeClass(
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

export default function PricingDashboard() {
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

  const [prices, setPrices] =
    useState<Record<string, number>>({});

  const [costs, setCosts] =
    useState<Record<string, number>>({});

  const [stocks, setStocks] =
    useState<Record<string, StockInfo>>({});

  const [
    marginOverrides,
    setMarginOverrides,
  ] = useState<Record<string, number>>(
    {}
  );

  const [
    defaultMinMargin,
    setDefaultMinMargin,
  ] = useState(20);

  const [
    warningBuffer,
    setWarningBuffer,
  ] = useState(5);

  const [isLoading, setIsLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [filtersOpen, setFiltersOpen] =
    useState(false);

  const [searchQuery, setSearchQuery] =
    useState("");

  const [brandFilter, setBrandFilter] =
    useState("");

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState("");

  const [stockFilter, setStockFilter] =
    useState<StockFilter>("all");

  const [statusFilter, setStatusFilter] =
    useState<"all" | ProductStatus>(
      "all"
    );

  const [
    priceGroupFilter,
    setPriceGroupFilter,
  ] = useState("all");

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

  const sortedPriceGroups =
    useMemo(() => {
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

  const basePriceGroup =
    useMemo(
      () =>
        sortedPriceGroups.find(
          (group) =>
            group.is_base_price
        ) ?? null,
      [sortedPriceGroups]
    );

  function getEffectiveMinMargin(
    productId: string
  ) {
    return (
      marginOverrides[productId] ??
      defaultMinMargin
    );
  }

  function getHealthForProduct(
    productId: string
  ): MarginHealth {
    const cost =
      costs[productId];

    if (cost === undefined) {
      return "missing_cost";
    }

    const minimum =
      getEffectiveMinMargin(
        productId
      );

    /*
     * Specific selected price group
     */
    if (
      priceGroupFilter !== "all"
    ) {
      const price =
        prices[
        makePriceKey(
          productId,
          priceGroupFilter
        )
        ];

      if (price === undefined) {
        return "no_price";
      }

      return getMarginHealth(
        calculateMargin(
          price,
          cost
        ),
        minimum,
        warningBuffer
      );
    }

    /*
     * All groups:
     * use worst available margin.
     */

    const priority: Record<
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

    let hasAnyPrice = false;

    for (
      const group
      of sortedPriceGroups
    ) {
      const price =
        prices[
        makePriceKey(
          productId,
          group.id
        )
        ];

      if (price === undefined) {
        continue;
      }

      hasAnyPrice = true;

      const health =
        getMarginHealth(
          calculateMargin(
            price,
            cost
          ),
          minimum,
          warningBuffer
        );

      if (
        priority[health] >
        priority[worst]
      ) {
        worst = health;
      }
    }

    return hasAnyPrice
      ? worst
      : "no_price";
  }

  const filteredProducts =
    useMemo(() => {
      const query = searchQuery
        .trim()
        .toLowerCase();

      return products.filter(
        (product) => {
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
            stocks[product.id]
              ?.available ?? 0;

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

          const matchesStock =
            stockFilter === "all" ||
            (stockFilter ===
              "in_stock" &&
              stock > 0) ||
            (stockFilter ===
              "out_of_stock" &&
              stock <= 0);

          const matchesStatus =
            statusFilter === "all" ||
            product.status ===
            statusFilter;

          return (
            matchesSearch &&
            matchesBrand &&
            matchesCategory &&
            matchesStock &&
            matchesStatus
          );
        }
      );
    }, [
      products,
      searchQuery,
      brandFilter,
      categoryFilter,
      stockFilter,
      statusFilter,
      brandMap,
      categoryMap,
      stocks,
    ]);

  /*
   * Main KPI calculations
   */

  const dashboardStats =
    useMemo(() => {
      let productsWithCost = 0;
      let missingCost = 0;

      let healthy = 0;
      let warning = 0;
      let critical = 0;
      let loss = 0;
      let noPrice = 0;

      let inventoryCostValue = 0;
      let potentialListValue = 0;
      let potentialGrossProfit = 0;

      for (
        const product
        of filteredProducts
      ) {
        const cost =
          costs[product.id];

        const quantity =
          stocks[product.id]
            ?.quantity ?? 0;

        if (cost === undefined) {
          missingCost += 1;
        } else {
          productsWithCost += 1;

          inventoryCostValue +=
            quantity * cost;
        }

        const health =
          getHealthForProduct(
            product.id
          );

        switch (health) {
          case "healthy":
            healthy += 1;
            break;

          case "warning":
            warning += 1;
            break;

          case "critical":
            critical += 1;
            break;

          case "loss":
            loss += 1;
            break;

          case "no_price":
            noPrice += 1;
            break;
        }

        if (basePriceGroup) {
          const listPrice =
            prices[
            makePriceKey(
              product.id,
              basePriceGroup.id
            )
            ];

          if (
            listPrice !== undefined
          ) {
            potentialListValue +=
              quantity *
              listPrice;

            if (
              cost !== undefined
            ) {
              potentialGrossProfit +=
                quantity *
                (listPrice -
                  cost);
            }
          }
        }
      }

      const belowMargin =
        warning +
        critical +
        loss;

      return {
        total:
          filteredProducts.length,

        productsWithCost,
        missingCost,
        healthy,
        warning,
        critical,
        loss,
        noPrice,
        belowMargin,

        inventoryCostValue,
        potentialListValue,
        potentialGrossProfit,
      };
    }, [
      filteredProducts,
      costs,
      stocks,
      prices,
      basePriceGroup,
      priceGroupFilter,
      sortedPriceGroups,
      marginOverrides,
      defaultMinMargin,
      warningBuffer,
    ]);

  /*
   * Average margin per price group
   */

  const groupMargins =
    useMemo(() => {
      return sortedPriceGroups.map(
        (group) => {
          let totalMargin = 0;
          let count = 0;

          for (
            const product
            of filteredProducts
          ) {
            const cost =
              costs[product.id];

            const price =
              prices[
              makePriceKey(
                product.id,
                group.id
              )
              ];

            const margin =
              calculateMargin(
                price,
                cost
              );

            if (
              margin === null
            ) {
              continue;
            }

            totalMargin +=
              margin;

            count += 1;
          }

          return {
            group,
            average:
              count > 0
                ? totalMargin /
                count
                : null,

            count,
          };
        }
      );
    }, [
      sortedPriceGroups,
      filteredProducts,
      costs,
      prices,
    ]);

  /*
   * Risk table
   */

  const riskRows =
    useMemo<RiskRow[]>(() => {
      const rows: RiskRow[] = [];

      for (
        const product
        of filteredProducts
      ) {
        const cost =
          costs[product.id];

        if (cost === undefined) {
          continue;
        }

        const minimum =
          getEffectiveMinMargin(
            product.id
          );

        /*
         * Specific group
         */

        if (
          priceGroupFilter !== "all"
        ) {
          const group =
            sortedPriceGroups.find(
              (item) =>
                item.id ===
                priceGroupFilter
            );

          if (!group) {
            continue;
          }

          const price =
            prices[
            makePriceKey(
              product.id,
              group.id
            )
            ];

          const margin =
            calculateMargin(
              price,
              cost
            );

          if (
            price === undefined ||
            margin === null
          ) {
            continue;
          }

          rows.push({
            product,
            group,
            cost,
            price,
            margin,
            stock:
              stocks[
                product.id
              ]?.quantity ?? 0,
            minMargin:
              minimum,
          });

          continue;
        }

        /*
         * All groups -> worst margin
         */

        let worst:
          | RiskRow
          | null = null;

        for (
          const group
          of sortedPriceGroups
        ) {
          const price =
            prices[
            makePriceKey(
              product.id,
              group.id
            )
            ];

          const margin =
            calculateMargin(
              price,
              cost
            );

          if (
            price === undefined ||
            margin === null
          ) {
            continue;
          }

          if (
            !worst ||
            margin <
            worst.margin
          ) {
            worst = {
              product,
              group,
              cost,
              price,
              margin,
              stock:
                stocks[
                  product.id
                ]?.quantity ??
                0,
              minMargin:
                minimum,
            };
          }
        }

        if (worst) {
          rows.push(worst);
        }
      }

      return rows
        .sort(
          (a, b) =>
            a.margin -
            b.margin
        )
        .slice(0, 10);
    }, [
      filteredProducts,
      costs,
      prices,
      stocks,
      sortedPriceGroups,
      priceGroupFilter,
      marginOverrides,
      defaultMinMargin,
    ]);

  const activeFilterCount =
    [
      searchQuery.trim(),
      brandFilter,
      categoryFilter,
      stockFilter !== "all"
        ? stockFilter
        : "",
      statusFilter !== "all"
        ? statusFilter
        : "",
      priceGroupFilter !== "all"
        ? priceGroupFilter
        : "",
    ].filter(Boolean).length;

  /*
   * Data fetching
   */

  async function fetchAllPrices() {
    const allRows: ProductPrice[] =
      [];

    let from = 0;
    const limit = 1000;

    while (true) {
      const { data, error } =
        await supabase
          .from("product_prices")
          .select(
            `
              id,
              product_id,
              price_group_id,
              amount
            `
          )
          .eq("is_active", true)
          .is("valid_to", null)
          .eq(
            "currency_code",
            "USD"
          )
          .order("id")
          .range(
            from,
            from + limit - 1
          );

      if (error) {
        return {
          data:
            [] as ProductPrice[],
          error,
        };
      }

      const rows =
        (data ??
          []) as ProductPrice[];

      allRows.push(...rows);

      if (
        rows.length <
        limit
      ) {
        break;
      }

      from += limit;
    }

    return {
      data: allRows,
      error: null,
    };
  }

  async function fetchAllCosts() {
    const allRows: ProductCost[] =
      [];

    let from = 0;
    const limit = 1000;

    while (true) {
      const { data, error } =
        await supabase
          .from("product_costs")
          .select(
            `
              id,
              product_id,
              amount
            `
          )
          .eq("is_active", true)
          .is("valid_to", null)
          .eq(
            "currency_code",
            "USD"
          )
          .order("id")
          .range(
            from,
            from + limit - 1
          );

      if (error) {
        return {
          data:
            [] as ProductCost[],
          error,
        };
      }

      const rows =
        (data ??
          []) as ProductCost[];

      allRows.push(...rows);

      if (
        rows.length <
        limit
      ) {
        break;
      }

      from += limit;
    }

    return {
      data: allRows,
      error: null,
    };
  }

  async function loadDashboard() {
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
        .from(
          "product_categories"
        )
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

      fetchAllPrices(),

      fetchAllCosts(),

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
        .from(
          "pricing_settings"
        )
        .select(
          `
            default_min_margin_percent,
            warning_margin_buffer_percent
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

    const priceMap: Record<
      string,
      number
    > = {};

    const costMap: Record<
      string,
      number
    > = {};

    const stockMap: Record<
      string,
      StockInfo
    > = {};

    const overrideMap: Record<
      string,
      number
    > = {};

    for (
      const price
      of pricesResult.data
    ) {
      priceMap[
        makePriceKey(
          price.product_id,
          price.price_group_id
        )
      ] = Number(
        price.amount
      );
    }

    for (
      const cost
      of costsResult.data
    ) {
      costMap[
        cost.product_id
      ] = Number(
        cost.amount
      );
    }

    for (
      const stock
      of (stockResult.data ??
        []) as StockTotal[]
    ) {
      stockMap[
        stock.product_id
      ] = {
        quantity:
          Number(
            stock.quantity ??
            0
          ),

        available:
          Number(
            stock.available_quantity ??
            0
          ),
      };
    }

    for (
      const setting
      of (marginResult.data ??
        []) as ProductMarginSetting[]
    ) {
      overrideMap[
        setting.product_id
      ] = Number(
        setting.min_margin_percent
      );
    }

    const settings =
      settingsResult.data as PricingSettings;

    setProducts(
      (productsResult.data ??
        []) as ProductRow[]
    );

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

    setPrices(priceMap);
    setCosts(costMap);
    setStocks(stockMap);

    setMarginOverrides(
      overrideMap
    );

    setDefaultMinMargin(
      Number(
        settings.default_min_margin_percent ??
        20
      )
    );

    setWarningBuffer(
      Number(
        settings.warning_margin_buffer_percent ??
        5
      )
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

      await loadDashboard();
    }

    initialize();
  }, []);

  function clearFilters() {
    setSearchQuery("");
    setBrandFilter("");
    setCategoryFilter("");
    setStockFilter("all");
    setStatusFilter("all");

    setPriceGroupFilter(
      "all"
    );
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

  if (
    hasAccess === false
  ) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-8 text-center dark:border-error-500/30 dark:bg-error-500/10">
        <h3 className="text-lg font-semibold text-error-700 dark:text-error-400">
          Access Denied
        </h3>

        <p className="mt-2 text-sm text-error-600 dark:text-error-400">
          Pricing financial
          information is available
          only to admins.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500 dark:border-brand-500/20 dark:border-t-brand-400" />

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading pricing
            dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 dark:border-error-500/30 dark:bg-error-500/10">
        <h3 className="font-semibold text-error-700 dark:text-error-400">
          Pricing dashboard could
          not be loaded
        </h3>

        <p className="mt-2 text-sm text-error-600 dark:text-error-400">
          {errorMessage}
        </p>
      </div>
    );
  }

  const healthTotal =
    dashboardStats.healthy +
    dashboardStats.warning +
    dashboardStats.critical +
    dashboardStats.loss +
    dashboardStats.missingCost +
    dashboardStats.noPrice;

  const selectedGroupName =
    priceGroupFilter === "all"
      ? "All Price Groups"
      : sortedPriceGroups.find(
        (group) =>
          group.id ===
          priceGroupFilter
      )?.name ??
      "Price Group";

  return (
    <div className="space-y-6">
      {/* HEADER */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
              Pricing Dashboard
            </h1>

            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
              USD
            </span>
          </div>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Pricing, margin and
            inventory value overview.
          </p>
        </div>

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
              activeFilterCount > 0
              ? "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 text-sm font-medium text-brand-700 shadow-theme-xs transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400"
              : secondaryButtonClass
          }
        >
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
            open={filtersOpen}
          />
        </button>
      </div>

      {/* FILTERS */}

      {filtersOpen && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Dashboard Filters
              </h2>

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                All dashboard metrics
                update immediately.
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
                Search
              </label>

              <input
                value={searchQuery}
                onChange={(event) =>
                  setSearchQuery(
                    event.target
                      .value
                  )
                }
                placeholder="SKU, product, barcode..."
                className={
                  inputClass
                }
              />
            </div>

            <FilterSelect
              label="Brand"
              value={brandFilter}
              onChange={
                setBrandFilter
              }
              options={brands}
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
                onChange={(event) =>
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
                onChange={(event) =>
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

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Margin Price Group
              </label>

              <select
                value={
                  priceGroupFilter
                }
                onChange={(event) =>
                  setPriceGroupFilter(
                    event.target
                      .value
                  )
                }
                className={
                  selectClass
                }
              >
                <option value="all">
                  All Price Groups
                </option>

                {sortedPriceGroups.map(
                  (group) => (
                    <option
                      key={
                        group.id
                      }
                      value={
                        group.id
                      }
                    >
                      {group.name}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* MAIN KPIs */}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          label="Products"
          value={formatNumber(
            dashboardStats.total
          )}
          helper={`${formatNumber(
            dashboardStats.productsWithCost
          )} with cost`}
        />

        <KpiCard
          label="Missing Cost"
          value={formatNumber(
            dashboardStats.missingCost
          )}
          helper="Products without current cost"
          type={
            dashboardStats.missingCost >
              0
              ? "warning"
              : "success"
          }
        />

        <KpiCard
          label="Below Min Margin"
          value={formatNumber(
            dashboardStats.belowMargin
          )}
          helper={selectedGroupName}
          type={
            dashboardStats.belowMargin >
              0
              ? "error"
              : "success"
          }
        />

        <KpiCard
          label="Healthy Products"
          value={formatNumber(
            dashboardStats.healthy
          )}
          helper={selectedGroupName}
          type="success"
        />
      </div>

      {/* FINANCIAL KPIs */}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          label="Inventory Cost Value"
          value={formatMoney(
            dashboardStats.inventoryCostValue
          )}
          helper="Physical stock × current cost"
        />

        <KpiCard
          label="Potential List Value"
          value={formatMoney(
            dashboardStats.potentialListValue
          )}
          helper={
            basePriceGroup
              ? `Physical stock × ${basePriceGroup.name}`
              : "Base price group not found"
          }
        />

        <KpiCard
          label="Potential Gross Profit"
          value={formatMoney(
            dashboardStats.potentialGrossProfit
          )}
          helper="List value − inventory cost"
          type={
            dashboardStats.potentialGrossProfit <
              0
              ? "error"
              : "success"
          }
        />
      </div>

      {/* HEALTH + GROUP MARGINS */}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Margin Health */}

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 xl:col-span-5">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Margin Health
            </h2>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {selectedGroupName}
            </p>
          </div>

          <div className="space-y-4">
            <HealthBar
              label="Healthy"
              value={
                dashboardStats.healthy
              }
              total={healthTotal}
              type="success"
            />

            <HealthBar
              label="Warning"
              value={
                dashboardStats.warning
              }
              total={healthTotal}
              type="warning"
            />

            <HealthBar
              label="Critical"
              value={
                dashboardStats.critical
              }
              total={healthTotal}
              type="error"
            />

            <HealthBar
              label="Loss"
              value={
                dashboardStats.loss
              }
              total={healthTotal}
              type="loss"
            />

            <HealthBar
              label="Missing Cost"
              value={
                dashboardStats.missingCost
              }
              total={healthTotal}
              type="gray"
            />

            <HealthBar
              label="No Price"
              value={
                dashboardStats.noPrice
              }
              total={healthTotal}
              type="gray"
            />
          </div>

          <div className="mt-5 border-t border-gray-100 pt-4 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:text-gray-400">
            Minimum margin:{" "}
            <strong className="text-gray-700 dark:text-gray-300">
              {defaultMinMargin}%
            </strong>
            . Critical threshold
            starts below approximately{" "}
            <strong className="text-gray-700 dark:text-gray-300">
              {Math.max(
                0,
                defaultMinMargin -
                warningBuffer
              )}
              %
            </strong>
            , unless a product has
            its own margin override.
          </div>
        </div>

        {/* Average Margins */}

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 xl:col-span-7">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Average Margin by
              Price Group
            </h2>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Average product margin
              for products with both
              cost and price.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {groupMargins.map(
              ({
                group,
                average,
                count,
              }) => {
                const health =
                  average === null
                    ? "no_price"
                    : getMarginHealth(
                      average,
                      defaultMinMargin,
                      warningBuffer
                    );

                return (
                  <div
                    key={
                      group.id
                    }
                    className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getGroupBadgeClass(
                          group
                        )}`}
                      >
                        {group.name}
                      </span>

                      <span className="text-xs text-gray-400">
                        {count} products
                      </span>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-2xl font-semibold text-gray-800 dark:text-white/90">
                          {average ===
                            null
                            ? "—"
                            : `${average.toFixed(
                              1
                            )}%`}
                        </p>

                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Average Margin
                        </p>
                      </div>

                      {average !==
                        null && (
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthBadgeClass(
                              health
                            )}`}
                          >
                            {healthLabel(
                              health
                            )}
                          </span>
                        )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </div>

      {/* RISK TABLE */}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Lowest Margin
              Products
            </h2>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              10 products with the
              lowest calculated
              margin for{" "}
              {selectedGroupName}.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Product
                </th>

                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Price Group
                </th>

                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Cost
                </th>

                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Price
                </th>

                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Margin
                </th>

                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Min
                </th>

                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Stock
                </th>

                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Status
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {riskRows.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    No margin data
                    available.
                  </td>
                </tr>
              ) : (
                riskRows.map(
                  (row) => {
                    const health =
                      getMarginHealth(
                        row.margin,
                        row.minMargin,
                        warningBuffer
                      );

                    const brand =
                      row.product
                        .brand_id
                        ? brandMap.get(
                          row.product
                            .brand_id
                        )
                        : null;

                    return (
                      <tr
                        key={`${row.product.id}:${row.group.id}`}
                        className="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                      >
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                            {
                              row
                                .product
                                .sku
                            }
                          </p>

                          <p className="mt-0.5 max-w-[280px] truncate text-xs text-gray-500 dark:text-gray-400">
                            {
                              row
                                .product
                                .name
                            }

                            {brand
                              ? ` • ${brand}`
                              : ""}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getGroupBadgeClass(
                              row.group
                            )}`}
                          >
                            {
                              row
                                .group
                                .name
                            }
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right text-sm font-medium text-gray-700 dark:text-gray-300">
                          {formatMoneyDetailed(
                            row.cost
                          )}
                        </td>

                        <td className="px-5 py-4 text-right text-sm font-medium text-gray-700 dark:text-gray-300">
                          {formatMoneyDetailed(
                            row.price
                          )}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${healthBadgeClass(
                              health
                            )}`}
                          >
                            {row.margin.toFixed(
                              1
                            )}
                            %
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right text-sm text-gray-500 dark:text-gray-400">
                          {row.minMargin.toFixed(
                            1
                          )}
                          %
                        </td>

                        <td className="px-5 py-4 text-right text-sm text-gray-700 dark:text-gray-300">
                          {formatNumber(
                            row.stock
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${healthBadgeClass(
                              health
                            )}`}
                          >
                            {healthLabel(
                              health
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  }
                )
              )}
            </tbody>
          </table>
        </div>
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
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className={selectClass}
      >
        <option value="">
          {allLabel}
        </option>

        {options.map(
          (item) => (
            <option
              key={item.id}
              value={item.id}
            >
              {item.name}
            </option>
          )
        )}
      </select>
    </div>
  );
}

function KpiCard({
  label,
  value,
  helper,
  type = "default",
}: {
  label: string;
  value: string;
  helper: string;
  type?:
  | "default"
  | "success"
  | "warning"
  | "error";
}) {
  const container =
    type === "success"
      ? "border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/10"
      : type === "warning"
        ? "border-warning-200 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/10"
        : type === "error"
          ? "border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-error-500/10"
          : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900";

  const valueClass =
    type === "success"
      ? "text-success-700 dark:text-success-400"
      : type === "warning"
        ? "text-warning-700 dark:text-warning-400"
        : type === "error"
          ? "text-error-700 dark:text-error-400"
          : "text-gray-800 dark:text-white/90";

  return (
    <div
      className={`rounded-2xl border p-5 shadow-theme-xs ${container}`}
    >
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </p>

      <p
        className={`mt-3 text-2xl font-semibold ${valueClass}`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {helper}
      </p>
    </div>
  );
}

function HealthBar({
  label,
  value,
  total,
  type,
}: {
  label: string;
  value: number;
  total: number;
  type:
  | "success"
  | "warning"
  | "error"
  | "loss"
  | "gray";
}) {
  const percentage =
    total > 0
      ? Math.min(
        100,
        (value / total) *
        100
      )
      : 0;

  const barClass =
    type === "success"
      ? "bg-success-500"
      : type === "warning"
        ? "bg-warning-500"
        : type === "error"
          ? "bg-error-400"
          : type === "loss"
            ? "bg-error-600"
            : "bg-gray-400";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </span>

        <div className="text-right">
          <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {value}
          </span>

          <span className="ml-2 text-xs text-gray-400">
            {percentage.toFixed(
              1
            )}
            %
          </span>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
        <div
          className={`h-full rounded-full transition-all ${barClass}`}
          style={{
            width: `${percentage}%`,
          }}
        />
      </div>
    </div>
  );
}

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