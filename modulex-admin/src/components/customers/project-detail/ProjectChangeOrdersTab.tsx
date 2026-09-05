"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_SURFACE_CARD, ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
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
import {
  cancelCustomerProjectChangeOrder,
  createCustomerProjectChangeOrder,
  getCustomerProjectChangeOrder,
  getCustomerProjectChangeOrders,
  getCustomerProjectChangeOrderSummary,
  linkCustomerProjectChangeOrderRevision,
  reviewCustomerProjectChangeOrder,
  setCustomerProjectChangeOrderLines,
  submitCustomerProjectChangeOrder,
  updateCustomerProjectChangeOrderDraft,
  type ProjectChangeOrderDetail,
  type ProjectChangeOrderEffectType,
  type ProjectChangeOrderLineInput,
  type ProjectChangeOrderListItem,
  type ProjectChangeOrderSummary,
} from "@/lib/customers/project-change-orders-domain";

export type ProjectChangeOrderOrder = {
  id: string;
  orderNumber: string;
  status: string;
  currencyCode: string;
};

type Props = {
  projectId: string;
  customerId: string;
  orders: ProjectChangeOrderOrder[];
  canManage: boolean;
  canReview: boolean;
  canViewCost: boolean;
};

type OrderItemOption = {
  id: string;
  orderId: string;
  productId: string | null;
  label: string;
};

type ProductOption = {
  id: string;
  label: string;
};

type EditableLine = {
  key: string;
  effectType: ProjectChangeOrderEffectType;
  targetOrderId: string;
  targetOrderItemId: string;
  productId: string;
  description: string;
  quantityDelta: string;
  sellAmountDelta: string;
  sellCurrencyCode: string;
  expectedCostDelta: string;
  costCurrencyCode: string;
  vendorCode: string;
};

const effectOptions: Array<{ value: ProjectChangeOrderEffectType; label: string }> = [
  { value: "add_scope", label: "Add scope" },
  { value: "remove_scope", label: "Remove scope" },
  { value: "quantity_change", label: "Quantity change" },
  { value: "price_adjustment", label: "Price adjustment" },
  { value: "customer_credit", label: "Customer credit" },
  { value: "vendor_credit", label: "Vendor / expected-cost credit" },
  { value: "other", label: "Other" },
];

function newLine(currencyCode = "USD"): EditableLine {
  return {
    key: crypto.randomUUID(),
    effectType: "add_scope",
    targetOrderId: "",
    targetOrderItemId: "",
    productId: "",
    description: "",
    quantityDelta: "",
    sellAmountDelta: "0",
    sellCurrencyCode: currencyCode || "USD",
    expectedCostDelta: "",
    costCurrencyCode: currencyCode || "USD",
    vendorCode: "",
  };
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function badgeColor(status: string): "primary" | "success" | "warning" | "error" | "info" | "light" {
  if (status === "approved" || status === "applied") return "success";
  if (status === "submitted" || status === "partial") return "warning";
  if (status === "rejected" || status === "cancelled") return "error";
  if (status === "pending") return "info";
  return "light";
}

function money(value: number | null, currency: string | null) {
  if (value === null || !currency) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function displayDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function numericOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Change Order numeric values must be valid numbers.");
  return parsed;
}

function numericOrZero(value: string) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) throw new Error("Change Order numeric values must be valid numbers.");
  return parsed;
}

function editableFromDetail(detail: ProjectChangeOrderDetail): EditableLine[] {
  return detail.lines.map((line) => ({
    key: line.id,
    effectType: line.effectType,
    targetOrderId: line.targetOrderId ?? "",
    targetOrderItemId: line.targetOrderItemId ?? "",
    productId: line.productId ?? "",
    description: line.description,
    quantityDelta: line.quantityDelta === null ? "" : String(line.quantityDelta),
    sellAmountDelta: String(line.sellAmountDelta),
    sellCurrencyCode: line.sellCurrencyCode,
    expectedCostDelta: line.expectedCostDelta === null ? "" : String(line.expectedCostDelta),
    costCurrencyCode: line.costCurrencyCode ?? line.sellCurrencyCode,
    vendorCode: line.vendorCode ?? "",
  }));
}

export default function ProjectChangeOrdersTab({ projectId, customerId, orders, canManage, canReview, canViewCost }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<ProjectChangeOrderListItem[]>([]);
  const [summary, setSummary] = useState<ProjectChangeOrderSummary | null>(null);
  const [detail, setDetail] = useState<ProjectChangeOrderDetail | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItemOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newReason, setNewReason] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editReason, setEditReason] = useState("");
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [revisionId, setRevisionId] = useState("");

  const orderOptions = useMemo(
    () => orders.map((order) => ({ value: order.id, label: `${order.orderNumber} — ${statusLabel(order.status)}` })),
    [orders],
  );
  const productOptions = useMemo(() => products.map((product) => ({ value: product.id, label: product.label })), [products]);
  const revisionOptions = useMemo(
    () => (detail?.candidateRevisions ?? []).map((revision) => ({
      value: revision.id,
      label: `${revision.orderNumber} — Revision ${revision.revisionNumber}${revision.reason ? ` — ${revision.reason}` : ""}`,
    })),
    [detail],
  );

  const loadOptions = useCallback(async () => {
    if (orders.length === 0) {
      setOrderItems([]);
    } else {
      const orderIds = orders.map((order) => order.id);
      const { data, error: itemsError } = await supabase
        .from("customer_order_items")
        .select("id, order_id, product_id, sku_snapshot, product_name_snapshot, line_no")
        .in("order_id", orderIds)
        .order("line_no");
      if (itemsError) throw itemsError;
      setOrderItems((data ?? []).map((row) => ({
        id: String(row.id),
        orderId: String(row.order_id),
        productId: row.product_id ? String(row.product_id) : null,
        label: `${row.sku_snapshot || "SKU"} — ${row.product_name_snapshot || "Order item"}`,
      })));
    }

    const { data: productRows, error: productsError } = await supabase
      .from("products")
      .select("id, sku, name")
      .neq("status", "archived")
      .order("name")
      .limit(500);
    if (productsError) throw productsError;
    setProducts((productRows ?? []).map((row) => ({
      id: String(row.id),
      label: `${row.sku || "SKU"} — ${row.name || "Product"}`,
    })));
  }, [orders]);

  const load = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [nextItems, nextSummary] = await Promise.all([
        getCustomerProjectChangeOrders(projectId),
        getCustomerProjectChangeOrderSummary(projectId),
        loadOptions(),
      ]).then(([loadedItems, loadedSummary]) => [loadedItems, loadedSummary] as const);
      setItems(nextItems);
      setSummary(nextSummary);
      const nextId = preferredId || selectedId || nextItems[0]?.id || "";
      setSelectedId(nextId);
      if (nextId) {
        const nextDetail = await getCustomerProjectChangeOrder(nextId);
        setDetail(nextDetail);
        setEditTitle(nextDetail.title);
        setEditReason(nextDetail.reason ?? "");
        setLines(editableFromDetail(nextDetail));
        setRevisionId("");
      } else {
        setDetail(null);
        setLines([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Change Orders could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [loadOptions, projectId, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setError(null);
    try {
      const nextDetail = await getCustomerProjectChangeOrder(id);
      setDetail(nextDetail);
      setEditTitle(nextDetail.title);
      setEditReason(nextDetail.reason ?? "");
      setLines(editableFromDetail(nextDetail));
      setRevisionId("");
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Change Order could not be opened.");
    }
  }

  async function createChangeOrder() {
    if (!canManage) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const id = await createCustomerProjectChangeOrder({ projectId, title: newTitle, reason: newReason });
      setNewTitle("");
      setNewReason("");
      setMessage("Draft Change Order created.");
      await load(id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Change Order could not be created.");
    } finally {
      setSaving(false);
    }
  }

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  async function persistDraft() {
    if (!detail || detail.status !== "draft" || !canManage) return;
    const payload: ProjectChangeOrderLineInput[] = lines.map((line) => ({
      effectType: line.effectType,
      targetOrderId: line.targetOrderId || null,
      targetOrderItemId: line.targetOrderItemId || null,
      productId: line.productId || null,
      description: line.description,
      quantityDelta: numericOrNull(line.quantityDelta),
      sellAmountDelta: numericOrZero(line.sellAmountDelta),
      sellCurrencyCode: line.sellCurrencyCode,
      expectedCostDelta: canViewCost ? numericOrNull(line.expectedCostDelta) : null,
      costCurrencyCode: canViewCost && line.expectedCostDelta.trim() ? line.costCurrencyCode : null,
      vendorCode: canViewCost ? line.vendorCode || null : null,
    }));
    await updateCustomerProjectChangeOrderDraft({ changeOrderId: detail.id, title: editTitle, reason: editReason });
    await setCustomerProjectChangeOrderLines(detail.id, payload);
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await persistDraft();
      setMessage("Draft Change Order saved.");
      await load(detail?.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Draft Change Order could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function submitDraft() {
    if (!detail || lines.length === 0) {
      setError("At least one Change Order line is required before submission.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await persistDraft();
      await submitCustomerProjectChangeOrder(detail.id);
      setMessage("Change Order submitted for review.");
      await load(detail.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Change Order could not be submitted.");
    } finally {
      setSaving(false);
    }
  }

  async function review(decision: "approved" | "rejected") {
    if (!detail || !canReview) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await reviewCustomerProjectChangeOrder(detail.id, decision, reviewNote);
      setReviewNote("");
      setMessage(decision === "approved" ? "Change Order approved. The Order is unchanged until an existing canonical Order revision is linked." : "Change Order rejected.");
      await load(detail.id);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Change Order review failed.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (!detail || !canReview) return;
    if (!reviewNote.trim()) {
      setError("A cancellation reason is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await cancelCustomerProjectChangeOrder(detail.id, reviewNote);
      setReviewNote("");
      setMessage("Change Order cancelled.");
      await load(detail.id);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Change Order could not be cancelled.");
    } finally {
      setSaving(false);
    }
  }

  async function linkRevision() {
    if (!detail || !canReview || !revisionId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await linkCustomerProjectChangeOrderRevision(detail.id, revisionId);
      setRevisionId("");
      setMessage("Canonical Order revision linked to the approved Change Order.");
      await load(detail.id);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Order revision could not be linked.");
    } finally {
      setSaving(false);
    }
  }

  const defaultCurrency = summary?.canonicalCurrencyCode || orders[0]?.currencyCode || "USD";

  return (
    <div className="space-y-6">
      {error ? <div role="alert"><Alert variant="error" title="Change Order action failed" message={error} /></div> : null}
      {message ? <div role="status"><Alert variant="success" title="Change Order updated" message={message} /></div> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <ComponentCard title="Current canonical Project" desc="PB-2 / current non-cancelled Order truth. Change Order approval never edits this value directly.">
          <p className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{money(summary?.canonicalSales ?? null, summary?.canonicalCurrencyCode ?? null)}</p>
          {summary?.canonicalMixedCurrency ? <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>Mixed Order currencies; aggregate is intentionally unavailable.</p> : null}
        </ComponentCard>
        <ComponentCard title="Approved pending application — sell impact" desc="Approved business value not yet reconciled to canonical Order revisions.">
          <p className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{money(summary?.approvedPendingSellImpact ?? null, summary?.pendingSellCurrencyCode ?? null)}</p>
          <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>{summary?.counts.approvedPending ?? 0} approved Change Order(s) pending reconciliation.</p>
        </ComponentCard>
        {canViewCost ? (
          <ComponentCard title="Approved pending application — expected cost impact" desc="Internal expectation only; actual vendor invoice and Finance truth remain canonical elsewhere.">
            <p className={`text-xl font-semibold ${ADMIN_TEXT_STYLES.strong}`}>{money(summary?.pendingExpectedCostImpact ?? null, summary?.pendingCostCurrencyCode ?? null)}</p>
            {summary?.pendingExpectedCostComplete === false ? <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>Incomplete expected-cost detail; aggregate is fail-closed.</p> : null}
          </ComponentCard>
        ) : null}
      </div>

      {canManage ? (
        <ComponentCard title="New Change Order" desc="Create a Draft business authorization record. Nothing here changes an Order until the approved Change Order is applied through the canonical Order revision workflow.">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="pb7-new-title">Title</Label>
              <Input id="pb7-new-title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Island cabinet addition" />
            </div>
            <div>
              <Label htmlFor="pb7-new-reason">Reason</Label>
              <Input id="pb7-new-reason" value={newReason} onChange={(event) => setNewReason(event.target.value)} placeholder="Customer-approved scope change" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={createChangeOrder} disabled={saving || !newTitle.trim()}>{saving ? "Working…" : "Create Draft"}</Button>
          </div>
        </ComponentCard>
      ) : null}

      <ComponentCard title="Change Orders" desc="Business authorization history. Application status is derived from explicit canonical Order revision links.">
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Change Order</TableCell>
                <TableCell isHeader variant="admin">Status</TableCell>
                <TableCell isHeader variant="admin">Application</TableCell>
                <TableCell isHeader variant="admin">Sell impact</TableCell>
                {canViewCost ? <TableCell isHeader variant="admin">Cost impact</TableCell> : null}
                <TableCell isHeader variant="admin">Submitted / reviewed</TableCell>
                <TableCell isHeader variant="admin">Action</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={canViewCost ? 7 : 6}>Loading Change Orders…</TableStateRow> : null}
              {!loading && items.length === 0 ? <TableStateRow colSpan={canViewCost ? 7 : 6}>No Change Orders have been recorded for this Project.</TableStateRow> : null}
              {!loading ? items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell variant="admin">
                    <div className="space-y-1">
                      <p className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>CO-{item.changeOrderNumber}: {item.title}</p>
                      <p className={`text-xs ${ADMIN_TEXT_STYLES.body}`}>{item.reason || "No reason recorded"}</p>
                    </div>
                  </TableCell>
                  <TableCell variant="admin"><Badge color={badgeColor(item.status)}>{statusLabel(item.status)}</Badge></TableCell>
                  <TableCell variant="admin"><Badge color={badgeColor(item.applicationStatus)}>{statusLabel(item.applicationStatus)}</Badge></TableCell>
                  <TableCell variant="admin">{money(item.approvedSellDelta, item.sellCurrencyCode)}</TableCell>
                  {canViewCost ? <TableCell variant="admin">{money(item.expectedCostDelta, item.costCurrencyCode)}</TableCell> : null}
                  <TableCell variant="admin">{displayDateTime(item.reviewedAt || item.submittedAt || item.createdAt)}</TableCell>
                  <TableCell variant="admin"><Button variant="outline" size="sm" onClick={() => void openDetail(item.id)}>Open</Button></TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>

      {detail ? (
        <ComponentCard
          title={`CO-${detail.changeOrderNumber} — ${detail.title}`}
          desc={`Status: ${statusLabel(detail.status)} · Application: ${statusLabel(detail.applicationStatus)}`}
          headerAction={<Badge color={badgeColor(detail.status)}>{statusLabel(detail.status)}</Badge>}
        >
          {detail.status === "draft" && canManage ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="pb7-edit-title">Title</Label>
                  <Input id="pb7-edit-title" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
                </div>
                <div>
                  <Label htmlFor="pb7-edit-reason">Reason</Label>
                  <Input id="pb7-edit-reason" value={editReason} onChange={(event) => setEditReason(event.target.value)} />
                </div>
              </div>

              <div className="space-y-4">
                {lines.map((line, index) => {
                  const itemOptions = orderItems
                    .filter((item) => !line.targetOrderId || item.orderId === line.targetOrderId)
                    .map((item) => ({ value: item.id, label: item.label }));
                  return (
                    <div key={line.key} className={`${ADMIN_SURFACE_CARD} p-4`}>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>Line {index + 1}</p>
                        <Button variant="ghost" size="sm" onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}>Remove</Button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <Label>Effect</Label>
                          <Select options={effectOptions} value={line.effectType} onChange={(value) => updateLine(line.key, { effectType: value as ProjectChangeOrderEffectType })} />
                        </div>
                        <div>
                          <Label>Target Order</Label>
                          <Select options={orderOptions} value={line.targetOrderId} onChange={(value) => updateLine(line.key, { targetOrderId: value, targetOrderItemId: "" })} placeholder="No specific Order" allowEmpty />
                        </div>
                        <div>
                          <Label>Target Order item</Label>
                          <Select options={itemOptions} value={line.targetOrderItemId} onChange={(value) => {
                            const selected = orderItems.find((item) => item.id === value);
                            updateLine(line.key, { targetOrderItemId: value, productId: selected?.productId || line.productId });
                          }} placeholder="No specific item" allowEmpty />
                        </div>
                        <div>
                          <Label>Product</Label>
                          <Select options={productOptions} value={line.productId} onChange={(value) => updateLine(line.key, { productId: value })} placeholder="No specific product" allowEmpty />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Description</Label>
                          <Input value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} placeholder="Describe the approved business change" />
                        </div>
                        <div>
                          <Label>Quantity delta</Label>
                          <Input type="number" step="0.0001" value={line.quantityDelta} onChange={(event) => updateLine(line.key, { quantityDelta: event.target.value })} />
                        </div>
                        <div>
                          <Label>Sell delta</Label>
                          <div className="grid grid-cols-[1fr_90px] gap-2">
                            <Input type="number" step="0.01" value={line.sellAmountDelta} onChange={(event) => updateLine(line.key, { sellAmountDelta: event.target.value })} />
                            <Input value={line.sellCurrencyCode} onChange={(event) => updateLine(line.key, { sellCurrencyCode: event.target.value.toUpperCase() })} maxLength={3} />
                          </div>
                        </div>
                        {canViewCost ? (
                          <>
                            <div>
                              <Label>Expected cost delta</Label>
                              <div className="grid grid-cols-[1fr_90px] gap-2">
                                <Input type="number" step="0.01" value={line.expectedCostDelta} onChange={(event) => updateLine(line.key, { expectedCostDelta: event.target.value })} />
                                <Input value={line.costCurrencyCode} onChange={(event) => updateLine(line.key, { costCurrencyCode: event.target.value.toUpperCase() })} maxLength={3} />
                              </div>
                            </div>
                            <div>
                              <Label>Vendor code</Label>
                              <Input value={line.vendorCode} onChange={(event) => updateLine(line.key, { vendorCode: event.target.value })} />
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap justify-between gap-3">
                <Button variant="outline" onClick={() => setLines((current) => [...current, newLine(defaultCurrency)])}>Add line</Button>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={saveDraft} disabled={saving}>Save Draft</Button>
                  <Button onClick={submitDraft} disabled={saving || lines.length === 0}>Submit for review</Button>
                </div>
              </div>
            </div>
          ) : (
            <TableViewport>
              <Table variant="admin" minWidth="standard">
                <TableHeader variant="admin">
                  <TableRow>
                    <TableCell isHeader variant="admin">Effect</TableCell>
                    <TableCell isHeader variant="admin">Description</TableCell>
                    <TableCell isHeader variant="admin">Sell delta</TableCell>
                    {canViewCost ? <TableCell isHeader variant="admin">Expected cost / vendor</TableCell> : null}
                    <TableCell isHeader variant="admin">Target</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody variant="admin">
                  {detail.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell variant="admin">{statusLabel(line.effectType)}</TableCell>
                      <TableCell variant="admin">{line.description}</TableCell>
                      <TableCell variant="admin">{money(line.sellAmountDelta, line.sellCurrencyCode)}</TableCell>
                      {canViewCost ? <TableCell variant="admin">{money(line.expectedCostDelta, line.costCurrencyCode)}{line.vendorCode ? ` · ${line.vendorCode}` : ""}</TableCell> : null}
                      <TableCell variant="admin">{orders.find((order) => order.id === line.targetOrderId)?.orderNumber || "Project"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableViewport>
          )}

          {detail.status === "submitted" && canReview ? (
            <div className={`${ADMIN_SURFACE_CARD} space-y-3 p-4`}>
              <Alert variant="warning" title="Approval authorizes the change only" message="Change Order approval does not update the Order, Procurement, Invoice, or Finance records. Apply it later through the canonical Order revision workflow." />
              <div>
                <Label htmlFor="pb7-review-note">Review note / cancellation reason</Label>
                <Input id="pb7-review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void review("approved")} disabled={saving}>Approve</Button>
                <Button variant="outline" onClick={() => void review("rejected")} disabled={saving}>Reject</Button>
                <Button variant="outline" onClick={() => void cancel()} disabled={saving}>Cancel</Button>
              </div>
            </div>
          ) : null}

          {detail.status === "draft" && canReview ? (
            <div className={`${ADMIN_SURFACE_CARD} space-y-3 p-4`}>
              <Label htmlFor="pb7-draft-cancel-reason">Cancellation reason</Label>
              <Input id="pb7-draft-cancel-reason" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
              <Button variant="outline" onClick={() => void cancel()} disabled={saving}>Cancel Draft</Button>
            </div>
          ) : null}

          {detail.status === "approved" ? (
            <div className={`${ADMIN_SURFACE_CARD} space-y-4 p-4`}>
              <div>
                <p className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>Application to canonical Order history</p>
                <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>Approval does not update the Order. Create/use the normal Order revision first, then explicitly link that canonical revision here.</p>
              </div>
              {canReview ? (
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
                  <div>
                    <Label htmlFor="pb7-revision-link">Link canonical Order revision</Label>
                    <Select id="pb7-revision-link" options={revisionOptions} value={revisionId} onChange={setRevisionId} placeholder="Select a post-approval revision" allowEmpty />
                  </div>
                  <Button variant="outline" onClick={() => {
                    const revision = detail.candidateRevisions.find((candidate) => candidate.id === revisionId);
                    if (revision) router.push(`/customers/${customerId}/orders/${revision.orderId}`);
                  }} disabled={!revisionId}>Open Order</Button>
                  <Button onClick={linkRevision} disabled={!revisionId || saving}>Link revision</Button>
                </div>
              ) : null}
              {detail.applications.length === 0 ? <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>No canonical Order revision has been linked yet.</p> : (
                <TableViewport>
                  <Table variant="admin" minWidth="compact">
                    <TableHeader variant="admin">
                      <TableRow>
                        <TableCell isHeader variant="admin">Revision</TableCell>
                        <TableCell isHeader variant="admin">Canonical sell delta</TableCell>
                        <TableCell isHeader variant="admin">Linked</TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody variant="admin">
                      {detail.applications.map((application) => (
                        <TableRow key={application.id}>
                          <TableCell variant="admin">{application.orderRevisionId}</TableCell>
                          <TableCell variant="admin">{money(application.canonicalSellDelta, application.currencyCode)}</TableCell>
                          <TableCell variant="admin">{displayDateTime(application.linkedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableViewport>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>Lifecycle history</p>
            {detail.events.length === 0 ? <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>No lifecycle events recorded.</p> : detail.events.map((event) => (
              <div key={event.id} className={`${ADMIN_SURFACE_CARD} flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm`}>
                <div className="flex items-center gap-2">
                  <Badge color={badgeColor(event.statusAfter)}>{statusLabel(event.eventType)}</Badge>
                  <span className={ADMIN_TEXT_STYLES.body}>{event.note || statusLabel(event.statusAfter)}</span>
                </div>
                <span className={ADMIN_TEXT_STYLES.body}>{displayDateTime(event.createdAt)}</span>
              </div>
            ))}
          </div>
        </ComponentCard>
      ) : null}
    </div>
  );
}
