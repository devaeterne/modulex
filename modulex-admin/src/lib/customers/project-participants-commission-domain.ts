import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile, type Profile } from "@/lib/supabase/profile";

const PB6_INTERNAL_ROLES = ["super_admin", "admin", "finance"] as const;

export type ProjectParticipantSubjectType = "employee" | "customer_contact" | "profile";
export type ProjectCommissionBasisType = "fixed" | "percentage";
export type ProjectCommissionScopeType = "project" | "category" | "product";
export type ProjectCommissionStatus = "pending" | "earned" | "approved" | "cancelled";
export type ProjectCommissionEventType = "earned" | "approved" | "cancelled" | "adjustment" | "offset" | "reversal";

export type ProjectParticipantRole = {
  id: string;
  roleKey: string;
  label: string;
  isSystem: boolean;
};

export type ProjectParticipant = {
  id: string;
  roleKey: string;
  roleLabel: string;
  subjectType: ProjectParticipantSubjectType;
  subjectId: string;
  displayName: string;
  isActive: boolean;
  source: "manual" | "project_sales_rep";
  startedAt: string;
  endedAt: string | null;
};

export type ProjectParticipantCandidate = {
  value: string;
  subjectType: ProjectParticipantSubjectType;
  subjectId: string;
  label: string;
};

export type ProjectCommissionScopeOption = {
  id: string;
  label: string;
};

export type ProjectCommissionObligation = {
  obligationId: string;
  participantId: string;
  participantName: string;
  roleLabel: string;
  scopeType: ProjectCommissionScopeType;
  basisType: ProjectCommissionBasisType;
  basisAmount: number | null;
  rate: number | null;
  flatAmount: number | null;
  currencyCode: string;
  baseAmount: number;
  currentAmount: number;
  status: ProjectCommissionStatus;
  paidAmount: number | null;
  createdAt: string;
};

type RawParticipant = {
  id?: string | null;
  role_key?: string | null;
  role_label?: string | null;
  subject_type?: string | null;
  subject_id?: string | null;
  display_name?: string | null;
  is_active?: boolean | null;
  source?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
};

type RawCommission = {
  obligation_id?: string | null;
  participant_id?: string | null;
  participant_name?: string | null;
  role_label?: string | null;
  scope_type?: string | null;
  basis_type?: string | null;
  basis_amount?: number | string | null;
  rate?: number | string | null;
  flat_amount?: number | string | null;
  currency_code?: string | null;
  base_amount?: number | string | null;
  current_amount?: number | string | null;
  status?: string | null;
  paid_amount?: number | string | null;
  created_at?: string | null;
};

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error("A numeric commission value is invalid.");
  return parsed;
}

function nullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function normalizeCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Currency must be a three-letter code.");
  return normalized;
}

function hasAnyRole(profile: Profile, roles: readonly Profile["role"][]) {
  return profile.roles.some((role) => roles.includes(role));
}

async function currentProfileOrThrow() {
  const { profile, error } = await getCurrentProfile();
  if (error) throw error;
  if (!profile) throw new Error("Profile could not be loaded.");
  return profile;
}

async function requireParticipantView() {
  const profile = await currentProfileOrThrow();
  if (!hasAnyRole(profile, PB6_INTERNAL_ROLES)) {
    throw new Error("You do not have permission to view Project participants.");
  }
  return profile;
}

async function requireParticipantManage() {
  const profile = await currentProfileOrThrow();
  if (!hasAnyRole(profile, ["super_admin", "admin"])) {
    throw new Error("You do not have permission to manage Project participants.");
  }
  return profile;
}

async function requireCommissionView() {
  const profile = await currentProfileOrThrow();
  if (!hasAnyRole(profile, ["super_admin", "admin", "finance", "sales"])) {
    throw new Error("You do not have permission to view Project commissions.");
  }
  return profile;
}

async function requireCommissionManage() {
  const profile = await currentProfileOrThrow();
  if (!hasAnyRole(profile, PB6_INTERNAL_ROLES)) {
    throw new Error("You do not have permission to manage Project commissions.");
  }
  return profile;
}

export async function getProjectParticipantAccess() {
  const profile = await currentProfileOrThrow();
  const canViewInternal = hasAnyRole(profile, PB6_INTERNAL_ROLES);
  return {
    canViewParticipants: canViewInternal,
    canManageParticipants: hasAnyRole(profile, ["super_admin", "admin"]),
    canViewCommissions: canViewInternal,
    canManageCommissions: canViewInternal,
  };
}

export async function getCustomerProjectParticipants(projectId: string): Promise<ProjectParticipant[]> {
  await requireParticipantView();
  const { data, error } = await supabase.rpc("get_customer_project_participants", { p_project_id: projectId });
  if (error) throw error;
  return ((data ?? []) as RawParticipant[]).map((row) => ({
    id: row.id ?? "",
    roleKey: row.role_key ?? "",
    roleLabel: row.role_label ?? "",
    subjectType: (row.subject_type ?? "profile") as ProjectParticipantSubjectType,
    subjectId: row.subject_id ?? "",
    displayName: row.display_name ?? "Unnamed participant",
    isActive: Boolean(row.is_active),
    source: (row.source ?? "manual") as ProjectParticipant["source"],
    startedAt: row.started_at ?? "",
    endedAt: row.ended_at ?? null,
  }));
}

export async function getProjectParticipantRoles(): Promise<ProjectParticipantRole[]> {
  await requireParticipantView();
  const { data, error } = await supabase
    .from("project_participant_roles")
    .select("id, role_key, label, is_system")
    .eq("is_active", true)
    .order("sort_order")
    .order("label");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    roleKey: String(row.role_key),
    label: String(row.label),
    isSystem: Boolean(row.is_system),
  }));
}

export async function getProjectParticipantCandidates(customerId: string): Promise<ProjectParticipantCandidate[]> {
  await requireParticipantManage();
  const [employeesResult, contactsResult, profilesResult] = await Promise.all([
    supabase
      .from("hr_employees")
      .select("id, employee_number, first_name, last_name, preferred_name, work_email")
      .eq("employment_status", "active")
      .order("first_name"),
    supabase
      .from("customer_contacts")
      .select("id, first_name, last_name, job_title, email")
      .eq("customer_id", customerId)
      .eq("is_active", true)
      .order("first_name"),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("is_active", true)
      .order("full_name"),
  ]);
  if (employeesResult.error) throw employeesResult.error;
  if (contactsResult.error) throw contactsResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const employeeCandidates: ProjectParticipantCandidate[] = (employeesResult.data ?? []).map((row) => {
    const name = row.preferred_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || row.work_email || row.employee_number || "Employee";
    return {
      value: `employee:${row.id}`,
      subjectType: "employee",
      subjectId: String(row.id),
      label: `${name} — Employee${row.employee_number ? ` ${row.employee_number}` : ""}`,
    };
  });
  const contactCandidates: ProjectParticipantCandidate[] = (contactsResult.data ?? []).map((row) => {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Customer contact";
    return {
      value: `customer_contact:${row.id}`,
      subjectType: "customer_contact",
      subjectId: String(row.id),
      label: `${name} — Customer contact${row.job_title ? ` (${row.job_title})` : ""}`,
    };
  });
  const profileCandidates: ProjectParticipantCandidate[] = (profilesResult.data ?? []).map((row) => ({
    value: `profile:${row.id}`,
    subjectType: "profile",
    subjectId: String(row.id),
    label: `${row.full_name || row.email || "Modulex user"} — Modulex user`,
  }));

  return [...employeeCandidates, ...contactCandidates, ...profileCandidates];
}

export async function setCustomerProjectParticipant(input: {
  projectId: string;
  roleKey: string;
  subjectType: ProjectParticipantSubjectType;
  subjectId: string;
  notes?: string | null;
}) {
  await requireParticipantManage();
  if (input.roleKey === "sales_rep") {
    throw new Error("Sales Rep is managed from canonical Project Settings, not from Participants.");
  }
  const { data, error } = await supabase.rpc("set_customer_project_participant", {
    p_project_id: input.projectId,
    p_role_key: requiredText(input.roleKey, "Participant role"),
    p_employee_id: input.subjectType === "employee" ? input.subjectId : null,
    p_customer_contact_id: input.subjectType === "customer_contact" ? input.subjectId : null,
    p_profile_id: input.subjectType === "profile" ? input.subjectId : null,
    p_notes: input.notes?.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

export async function deactivateCustomerProjectParticipant(participantId: string) {
  await requireParticipantManage();
  const { error } = await supabase.rpc("deactivate_customer_project_participant", { p_participant_id: participantId });
  if (error) throw error;
}

export async function getCustomerProjectCommissions(projectId: string): Promise<ProjectCommissionObligation[]> {
  await requireCommissionView();
  const { data, error } = await supabase.rpc("get_customer_project_commissions", { p_project_id: projectId });
  if (error) throw error;
  return ((data ?? []) as RawCommission[]).map((row) => ({
    obligationId: row.obligation_id ?? "",
    participantId: row.participant_id ?? "",
    participantName: row.participant_name ?? "Unnamed participant",
    roleLabel: row.role_label ?? "Participant",
    scopeType: (row.scope_type ?? "project") as ProjectCommissionScopeType,
    basisType: (row.basis_type ?? "fixed") as ProjectCommissionBasisType,
    basisAmount: nullableNumber(row.basis_amount),
    rate: nullableNumber(row.rate),
    flatAmount: nullableNumber(row.flat_amount),
    currencyCode: row.currency_code ?? "USD",
    baseAmount: numberValue(row.base_amount),
    currentAmount: numberValue(row.current_amount),
    status: (row.status ?? "pending") as ProjectCommissionStatus,
    paidAmount: nullableNumber(row.paid_amount),
    createdAt: row.created_at ?? "",
  }));
}

export async function getProjectCommissionScopeOptions(projectId: string): Promise<{
  categories: ProjectCommissionScopeOption[];
  products: ProjectCommissionScopeOption[];
}> {
  await requireCommissionManage();
  const { data: orderRows, error: ordersError } = await supabase
    .from("customer_orders")
    .select("id")
    .eq("project_id", projectId)
    .neq("status", "cancelled");
  if (ordersError) throw ordersError;
  const orderIds = (orderRows ?? []).map((row) => String(row.id));
  if (orderIds.length === 0) return { categories: [], products: [] };

  const { data: itemRows, error: itemsError } = await supabase
    .from("customer_order_items")
    .select("product_id, sku_snapshot, product_name_snapshot")
    .in("order_id", orderIds)
    .not("product_id", "is", null);
  if (itemsError) throw itemsError;

  const productIds = Array.from(new Set((itemRows ?? []).map((row) => row.product_id).filter(Boolean).map(String)));
  if (productIds.length === 0) return { categories: [], products: [] };

  const { data: productRows, error: productsError } = await supabase
    .from("products")
    .select("id, category_id")
    .in("id", productIds);
  if (productsError) throw productsError;

  const categoryIds = Array.from(new Set((productRows ?? []).map((row) => row.category_id).filter(Boolean).map(String)));
  const categoryNameById = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: categoryRows, error: categoriesError } = await supabase
      .from("product_categories")
      .select("id, name")
      .in("id", categoryIds);
    if (categoriesError) throw categoriesError;
    for (const row of categoryRows ?? []) categoryNameById.set(String(row.id), String(row.name));
  }

  const productCategoryById = new Map((productRows ?? []).map((row) => [String(row.id), row.category_id ? String(row.category_id) : null]));
  const products = Array.from(
    new Map((itemRows ?? []).filter((row) => row.product_id).map((row) => [
      String(row.product_id),
      {
        id: String(row.product_id),
        label: `${row.sku_snapshot || "SKU"} — ${row.product_name_snapshot || "Product"}`,
      } satisfies ProjectCommissionScopeOption,
    ])).values(),
  ).sort((a, b) => a.label.localeCompare(b.label));

  const categories = Array.from(
    new Set(Array.from(productCategoryById.values()).filter((id): id is string => Boolean(id))),
  ).map((id) => ({ id, label: categoryNameById.get(id) || "Category" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { categories, products };
}

export async function getCustomerProjectCommissionBasisPreview(input: {
  projectId: string;
  scopeType: ProjectCommissionScopeType;
  currencyCode: string;
  productCategoryId?: string | null;
  productId?: string | null;
}) {
  await requireCommissionManage();
  const currencyCode = normalizeCurrency(input.currencyCode);
  const { data, error } = await supabase.rpc("get_customer_project_commission_basis_preview", {
    p_project_id: input.projectId,
    p_scope_type: input.scopeType,
    p_currency_code: currencyCode,
    p_product_category_id: input.scopeType === "category" ? input.productCategoryId || null : null,
    p_product_id: input.scopeType === "product" ? input.productId || null : null,
  });
  if (error) throw error;
  const basis = Number(data);
  if (!Number.isFinite(basis) || basis <= 0) throw new Error("Commission basis is unavailable for this Project scope.");
  return basis;
}

export async function createCustomerProjectCommissionObligation(input: {
  projectId: string;
  participantId: string;
  basisType: ProjectCommissionBasisType;
  currencyCode: string;
  scopeType: ProjectCommissionScopeType;
  basisAmount?: number | null;
  rate?: number | null;
  flatAmount?: number | null;
  orderId?: string | null;
  productCategoryId?: string | null;
  productId?: string | null;
  description?: string | null;
}) {
  await requireCommissionManage();
  if (!input.participantId) throw new Error("Commission participant is required.");
  const currencyCode = normalizeCurrency(input.currencyCode);
  if (input.basisType === "fixed") {
    if (!Number.isFinite(input.flatAmount) || Number(input.flatAmount) <= 0) throw new Error("Fixed commission amount must be greater than zero.");
  } else {
    if (!Number.isFinite(input.rate) || Number(input.rate) <= 0 || Number(input.rate) > 100) throw new Error("Commission percentage must be greater than zero and at most 100.");
  }
  if (input.scopeType === "category" && !input.productCategoryId) throw new Error("Category scope requires a Project category.");
  if (input.scopeType === "product" && !input.productId) throw new Error("Product scope requires a Project product.");

  const { data, error } = await supabase.rpc("create_customer_project_commission_obligation", {
    p_project_id: input.projectId,
    p_participant_id: input.participantId,
    p_basis_type: input.basisType,
    p_currency_code: currencyCode,
    p_scope_type: input.scopeType,
    p_basis_amount: null,
    p_rate: input.basisType === "percentage" ? Number(input.rate) : null,
    p_flat_amount: input.basisType === "fixed" ? Number(input.flatAmount) : null,
    p_order_id: input.orderId || null,
    p_product_category_id: input.scopeType === "category" ? input.productCategoryId || null : null,
    p_product_id: input.scopeType === "product" ? input.productId || null : null,
    p_description: input.description?.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

export async function appendCustomerProjectCommissionEvent(input: {
  obligationId: string;
  eventType: ProjectCommissionEventType;
  amountDelta?: number | null;
  reason?: string | null;
  reversesEventId?: string | null;
}) {
  await requireCommissionManage();
  if (!input.obligationId) throw new Error("Commission obligation is required.");
  if (["cancelled", "adjustment", "offset", "reversal"].includes(input.eventType)) {
    requiredText(input.reason ?? "", "Reason");
  }
  if (["adjustment", "offset"].includes(input.eventType) && (!Number.isFinite(input.amountDelta) || Number(input.amountDelta) === 0)) {
    throw new Error("Adjustment amount must be non-zero.");
  }
  if (input.eventType === "offset" && Number(input.amountDelta) >= 0) throw new Error("Offset amount must be negative.");
  if (input.eventType === "reversal" && !input.reversesEventId) throw new Error("Reversal target event is required.");

  const { data, error } = await supabase.rpc("append_customer_project_commission_event", {
    p_obligation_id: input.obligationId,
    p_event_type: input.eventType,
    p_amount_delta: ["adjustment", "offset"].includes(input.eventType) ? Number(input.amountDelta) : null,
    p_reason: input.reason?.trim() || null,
    p_reverses_event_id: input.eventType === "reversal" ? input.reversesEventId || null : null,
  });
  if (error) throw error;
  return data as string;
}
