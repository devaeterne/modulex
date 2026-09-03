import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

export type ProjectFinancialCategory = "Cabinet" | "Countertop" | "Sink" | "Labor" | "Material" | "Other";

export type ProjectFinancialCategorySummary = {
  category: ProjectFinancialCategory;
  totalSales: number | null;
  totalCost: number | null;
  grossProfit: number | null;
  grossMarginPercent: number | null;
  markupPercent: number | null;
  missingCostLines: number;
};

export type ProjectFinancialSummary = {
  projectId: string;
  currencyCode: string;
  mixedCurrency: boolean;
  costComplete: boolean;
  missingCostLines: number;
  totalSales: number | null;
  totalCost: number | null;
  grossProfit: number | null;
  grossMarginPercent: number | null;
  markupPercent: number | null;
  invoiced: number | null;
  paid: number | null;
  balance: number | null;
  categories: ProjectFinancialCategorySummary[];
};

type RawProjectFinancialCategorySummary = {
  category?: string | null;
  total_sales?: number | string | null;
  total_cost?: number | string | null;
  gross_profit?: number | string | null;
  gross_margin_percent?: number | string | null;
  markup_percent?: number | string | null;
  missing_cost_lines?: number | string | null;
};

type RawProjectFinancialSummary = {
  project_id?: string | null;
  currency_code?: string | null;
  mixed_currency?: boolean | null;
  cost_complete?: boolean | null;
  missing_cost_lines?: number | string | null;
  total_sales?: number | string | null;
  total_cost?: number | string | null;
  gross_profit?: number | string | null;
  gross_margin_percent?: number | string | null;
  markup_percent?: number | string | null;
  invoiced?: number | string | null;
  paid?: number | string | null;
  balance?: number | string | null;
  categories?: RawProjectFinancialCategorySummary[] | null;
};

const PROJECT_FINANCIAL_CATEGORIES: ProjectFinancialCategory[] = [
  "Cabinet",
  "Countertop",
  "Sink",
  "Labor",
  "Material",
  "Other",
];

function numberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCategory(value: string | null | undefined): ProjectFinancialCategory {
  return PROJECT_FINANCIAL_CATEGORIES.includes(value as ProjectFinancialCategory)
    ? (value as ProjectFinancialCategory)
    : "Other";
}

export async function loadProjectFinancialSummary(projectId: string): Promise<ProjectFinancialSummary> {
  const { profile, error: profileError } = await getCurrentProfile();
  if (profileError) throw profileError;
  if (!profile || !hasPermission(profile.roles, "pricing.cost.view")) {
    throw new Error("You do not have permission to view Project cost and margin data.");
  }

  const { data, error } = await supabase.rpc("get_customer_project_financial_summary", {
    p_project_id: projectId,
  });
  if (error) throw error;
  if (!data) throw new Error("Project financial summary is unavailable.");

  const raw = data as unknown as RawProjectFinancialSummary;
  return {
    projectId: raw.project_id ?? projectId,
    currencyCode: raw.currency_code ?? "USD",
    mixedCurrency: Boolean(raw.mixed_currency),
    costComplete: Boolean(raw.cost_complete),
    missingCostLines: numberValue(raw.missing_cost_lines),
    totalSales: numberOrNull(raw.total_sales),
    totalCost: numberOrNull(raw.total_cost),
    grossProfit: numberOrNull(raw.gross_profit),
    grossMarginPercent: numberOrNull(raw.gross_margin_percent),
    markupPercent: numberOrNull(raw.markup_percent),
    invoiced: numberOrNull(raw.invoiced),
    paid: numberOrNull(raw.paid),
    balance: numberOrNull(raw.balance),
    categories: (raw.categories ?? []).map((category) => ({
      category: normalizeCategory(category.category),
      totalSales: numberOrNull(category.total_sales),
      totalCost: numberOrNull(category.total_cost),
      grossProfit: numberOrNull(category.gross_profit),
      grossMarginPercent: numberOrNull(category.gross_margin_percent),
      markupPercent: numberOrNull(category.markup_percent),
      missingCostLines: numberValue(category.missing_cost_lines),
    })),
  };
}
