"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type CheckStatus = "idle" | "running" | "pass" | "fail";

type CheckResult = {
  name: string;
  group: string;
  status: CheckStatus;
  durationMs?: number;
  detail?: string;
};

type CheckDefinition = {
  name: string;
  group: string;
  run: () => Promise<string>;
};

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Unknown API error");
  }
  return String(error);
}

export default function ApiTestPanel() {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  const definitions = useMemo<CheckDefinition[]>(() => {
    const readCheck = (name: string, table: string, columns: string): CheckDefinition => ({
      name,
      group: "Data API / RLS",
      run: async () => {
        const { data, error, count } = await supabase
          .from(table)
          .select(columns, { count: "exact" })
          .limit(1);
        if (error) throw error;
        return `Visible rows: ${count ?? data?.length ?? 0}`;
      },
    });

    const rpcCheck = (
      name: string,
      rpc: string,
      args: Record<string, unknown>,
    ): CheckDefinition => ({
      name,
      group: "RPC",
      run: async () => {
        const { data, error } = await supabase.rpc(rpc, args);
        if (error) throw error;
        const rows = Array.isArray(data) ? data.length : data == null ? 0 : 1;
        return `Response rows/objects: ${rows}`;
      },
    });

    return [
      {
        name: "Authenticated session",
        group: "Authentication",
        run: async () => {
          const { data, error } = await supabase.auth.getUser();
          if (error) throw error;
          if (!data.user) throw new Error("No authenticated user.");
          return data.user.email ?? data.user.id;
        },
      },
      {
        name: "Own profile and role",
        group: "Authentication",
        run: async () => {
          const { data: userData, error: userError } = await supabase.auth.getUser();
          if (userError) throw userError;
          if (!userData.user) throw new Error("No authenticated user.");
          const { data, error } = await supabase
            .from("profiles")
            .select("email,role,is_active")
            .eq("id", userData.user.id)
            .single();
          if (error) throw error;
          if (!data?.is_active) throw new Error("Profile is inactive.");
          return `${data.email ?? userData.user.email ?? userData.user.id} / ${data.role}`;
        },
      },
      readCheck("Products", "products", "id,sku,name,status"),
      readCheck("Customers", "customers", "id,customer_code,name,status"),
      readCheck("Inventory", "inventory", "id,product_id,quantity,reserved_quantity"),
      readCheck("Warehouses", "warehouses", "id,code,name,is_active"),
      readCheck("Price groups", "price_groups", "id,system_key,name,is_active"),
      readCheck("Payment methods", "payment_methods", "id,system_key,name,is_active"),
      readCheck("General settings", "general_settings", "id,company_name,default_currency,locale,timezone"),
      readCheck("Orders", "customer_orders", "id,order_number,status,customer_id"),
      readCheck("Invoices", "customer_invoices", "id,invoice_number,status,customer_id"),
      readCheck("Shipments", "customer_shipments", "id,shipment_number,status,customer_id"),
      readCheck("Installations", "customer_installations", "id,installation_number,status,customer_id"),
      rpcCheck("get_products_page", "get_products_page", { p_query: "", p_page: 1, p_page_size: 1 }),
      rpcCheck("get_product_prices_page", "get_product_prices_page", { p_query: "", p_page: 1, p_page_size: 1, p_currency_code: "USD" }),
      rpcCheck("get_product_stock_totals", "get_product_stock_totals", {}),
      rpcCheck("get_low_stock_items", "get_low_stock_items", { p_limit: 1 }),
      rpcCheck("search_stock", "search_stock", { p_query: "", p_limit: 1 }),
      rpcCheck("get_recent_inventory_movements", "get_recent_inventory_movements", { p_limit: 1 }),
    ];
  }, []);

  async function runChecks() {
    if (running) return;
    setRunning(true);
    setResults(definitions.map((check) => ({ name: check.name, group: check.group, status: "idle" })));

    const nextResults: CheckResult[] = [];
    for (const definition of definitions) {
      setResults([
        ...nextResults,
        { name: definition.name, group: definition.group, status: "running" },
        ...definitions.slice(nextResults.length + 1).map((check) => ({
          name: check.name,
          group: check.group,
          status: "idle" as const,
        })),
      ]);

      const startedAt = performance.now();
      try {
        const detail = await definition.run();
        nextResults.push({
          name: definition.name,
          group: definition.group,
          status: "pass",
          durationMs: Math.round(performance.now() - startedAt),
          detail,
        });
      } catch (error) {
        nextResults.push({
          name: definition.name,
          group: definition.group,
          status: "fail",
          durationMs: Math.round(performance.now() - startedAt),
          detail: formatError(error),
        });
      }
    }

    setResults(nextResults);
    setLastRunAt(new Date().toLocaleString());
    setRunning(false);
  }

  const passed = results.filter((item) => item.status === "pass").length;
  const failed = results.filter((item) => item.status === "fail").length;
  const groups = ["Authentication", "Data API / RLS", "RPC"];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Safe API / RLS Smoke Test</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              Runs read-only checks through the same browser Supabase client, authenticated session, Data API and RLS policies used by Modulex Admin. No records are created, updated or deleted from this page.
            </p>
          </div>
          <button
            type="button"
            onClick={runChecks}
            disabled={running}
            className="inline-flex min-w-36 items-center justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {running ? "Running checks…" : "Run API Test"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.04]">
            <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Passed</p>
            <p className="mt-1 text-2xl font-semibold text-success-600 dark:text-success-400">{passed}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.04]">
            <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Failed</p>
            <p className="mt-1 text-2xl font-semibold text-error-600 dark:text-error-400">{failed}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.04]">
            <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Last run</p>
            <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">{lastRunAt ?? "Not run yet"}</p>
          </div>
        </div>
      </div>

      {groups.map((group) => {
        const groupResults = results.length
          ? results.filter((item) => item.group === group)
          : definitions.filter((item) => item.group === group).map((item) => ({
              name: item.name,
              group: item.group,
              status: "idle" as const,
            }));

        return (
          <div key={group} className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <h3 className="font-semibold text-gray-800 dark:text-white/90">{group}</h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {groupResults.map((result) => (
                <div key={result.name} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{result.name}</p>
                    {result.detail ? <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">{result.detail}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {typeof result.durationMs === "number" ? <span className="text-xs text-gray-400">{result.durationMs} ms</span> : null}
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      result.status === "pass"
                        ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
                        : result.status === "fail"
                          ? "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400"
                          : result.status === "running"
                            ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"
                            : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                    }`}>
                      {result.status === "pass" ? "PASS" : result.status === "fail" ? "FAIL" : result.status === "running" ? "RUNNING" : "READY"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="rounded-2xl border border-warning-200 bg-warning-50 p-5 text-sm leading-6 text-warning-800 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300">
        Full write/CRUD and business-flow smoke tests are intentionally terminal-only. Run <code className="font-semibold">npm run smoke:db</code> for the transaction + rollback suite, or <code className="font-semibold">npm run smoke</code> for both API and database smoke tests.
      </div>
    </div>
  );
}
