"use client";

import { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import ProjectProcurementOrderActions from "@/components/customers/project-detail/ProjectProcurementOrderActions";
import ProjectProcurementReceiptInvoiceActions from "@/components/customers/project-detail/ProjectProcurementReceiptInvoiceActions";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
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
import {
  loadProjectProcurement,
  loadProjectProcurementStatus,
  type ProjectProcurementAttentionState,
  type ProjectProcurementCommitment,
  type ProjectProcurementLedger,
  type ProjectProcurementRequirement,
  type ProjectProcurementSourceKind,
  type ProjectProcurementStatus,
} from "@/lib/customers/project-procurement";

type ProjectProcurementTabProps = {
  projectId: string;
  canViewProcurement: boolean;
  canViewDetails: boolean;
  canManageProcurement: boolean;
  canManageInvoices: boolean;
};

type BadgeColor = "success" | "warning" | "error" | "info" | "light" | "primary";

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function sourceLabel(sourceKind: ProjectProcurementSourceKind) {
  if (sourceKind === "countertop_stone") return "Countertop Stone";
  if (sourceKind === "countertop_sink") return "Countertop Sink";
  return "Order Item";
}

function attentionLabel(state: ProjectProcurementAttentionState) {
  if (state === "vendor_required") return "Vendor Required";
  if (state === "cost_required") return "Cost Required";
  if (state === "quantity_required") return "Quantity Required";
  if (state === "open_to_purchase") return "Open to Purchase";
  if (state === "excess_ordered") return "Excess Ordered";
  if (state === "retired") return "Historical";
  return "Ready";
}

function attentionColor(state: ProjectProcurementAttentionState): BadgeColor {
  if (state === "ready") return "success";
  if (state === "open_to_purchase") return "info";
  if (state === "excess_ordered" || state === "vendor_required" || state === "cost_required" || state === "quantity_required") return "warning";
  return "light";
}

function deliveryColor(state: string): BadgeColor {
  if (state === "delivered") return "success";
  if (state === "partially_delivered") return "warning";
  return "light";
}

function invoiceColor(state: string): BadgeColor {
  if (state === "invoiced") return "success";
  if (state === "partially_invoiced") return "warning";
  return "light";
}

function money(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode }).format(value);
  } catch {
    return `${currencyCode} ${value.toFixed(2)}`;
  }
}

function activeCommitments(requirement: ProjectProcurementRequirement) {
  return requirement.commitments.filter((commitment) => commitment.status !== "cancelled");
}

function vendorCost(requirement: ProjectProcurementRequirement) {
  const commitments = activeCommitments(requirement);
  if (commitments.length > 0) {
    return (
      <div className="space-y-1">
        {commitments.map((commitment) => (
          <p key={commitment.id}>{money(commitment.agreedUnitCost, commitment.currencyCode)} / unit</p>
        ))}
      </div>
    );
  }
  if (requirement.expectedUnitCost === null || !requirement.expectedCostCurrency) return <Badge color="warning">Cost Required</Badge>;
  return <span>{money(requirement.expectedUnitCost, requirement.expectedCostCurrency)} / unit</span>;
}

function deliveryDisplay(commitments: ProjectProcurementCommitment[]) {
  if (commitments.length === 0) return <Badge color="light">Not Ordered</Badge>;
  return (
    <div className="space-y-1">
      {commitments.map((commitment) => (
        <div key={commitment.id} className="flex flex-wrap items-center gap-2">
          <span>{commitment.deliveredQuantity} / {commitment.orderedQuantity}</span>
          <Badge color={deliveryColor(commitment.deliveryState)}>{statusLabel(commitment.deliveryState)}</Badge>
        </div>
      ))}
    </div>
  );
}

function invoiceDisplay(commitments: ProjectProcurementCommitment[]) {
  if (commitments.length === 0) return <Badge color="light">Not Ordered</Badge>;
  return (
    <div className="space-y-1">
      {commitments.map((commitment) => (
        <div key={commitment.id} className="flex flex-wrap items-center gap-2">
          <span>{commitment.invoicedQuantity} / {commitment.orderedQuantity}</span>
          <Badge color={invoiceColor(commitment.invoiceState)}>{statusLabel(commitment.invoiceState)}</Badge>
        </div>
      ))}
    </div>
  );
}

export default function ProjectProcurementTab({
  projectId,
  canViewProcurement,
  canViewDetails,
  canManageProcurement,
  canManageInvoices,
}: ProjectProcurementTabProps) {
  const [ledger, setLedger] = useState<ProjectProcurementLedger | null>(null);
  const [status, setStatus] = useState<ProjectProcurementStatus | null>(null);
  const [loading, setLoading] = useState(canViewProcurement);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canViewProcurement) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (canViewDetails) {
        setLedger(await loadProjectProcurement(projectId));
        setStatus(null);
      } else {
        setStatus(await loadProjectProcurementStatus(projectId));
        setLedger(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Project procurement could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [canViewDetails, canViewProcurement, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canViewProcurement) {
    return <Alert variant="warning" title="Procurement access restricted" message="You do not have permission to view Project procurement." />;
  }

  if (!canViewDetails) {
    return (
      <ComponentCard title="Procurement" desc="Project purchase status. Vendor cost, PO and invoice amounts are restricted.">
        {error ? <div className="space-y-3"><Alert variant="error" title="Procurement could not be loaded" message={error} /><Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div> : null}
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin"><TableRow>
              <TableCell isHeader variant="admin">Product</TableCell>
              <TableCell isHeader variant="admin">Required</TableCell>
              <TableCell isHeader variant="admin">Ordered</TableCell>
              <TableCell isHeader variant="admin">Delivery</TableCell>
              <TableCell isHeader variant="admin">Invoiced</TableCell>
            </TableRow></TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={5}>Loading Project procurement…</TableStateRow> : null}
              {!loading && !error && (status?.requirements.length ?? 0) === 0 ? <TableStateRow colSpan={5}>No confirmed Project purchases yet.</TableStateRow> : null}
              {!loading && !error ? (status?.requirements ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell variant="admin"><div className="space-y-1"><p className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{row.productName}</p><p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{row.sku} · {sourceLabel(row.sourceKind)} · {row.orderNumber}</p></div></TableCell>
                  <TableCell variant="admin">{row.requiredQuantity ?? "—"}</TableCell>
                  <TableCell variant="admin"><div className="space-y-1"><p>{row.orderedQuantity}</p><Badge color={row.orderState === "ordered" ? "success" : row.orderState === "excess_ordered" ? "warning" : "info"}>{statusLabel(row.orderState)}</Badge></div></TableCell>
                  <TableCell variant="admin"><div className="space-y-1"><p>{row.deliveredQuantity} / {row.orderedQuantity}</p><Badge color={deliveryColor(row.deliveryState)}>{statusLabel(row.deliveryState)}</Badge></div></TableCell>
                  <TableCell variant="admin"><div className="space-y-1"><p>{row.invoicedQuantity} / {row.orderedQuantity}</p><Badge color={invoiceColor(row.invoiceState)}>{statusLabel(row.invoiceState)}</Badge></div></TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </TableViewport>
      </ComponentCard>
    );
  }

  return (
    <ComponentCard title="Procurement" desc="What this Project needs to buy, vendor commitment, delivery and vendor-invoice allocation. Vendor payment status belongs to Finance.">
      {error ? <div className="space-y-3"><Alert variant="error" title="Procurement could not be loaded" message={error} /><Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div> : null}
      <TableViewport>
        <Table variant="admin" minWidth="wide">
          <TableHeader variant="admin"><TableRow>
            <TableCell isHeader variant="admin">Vendor</TableCell>
            <TableCell isHeader variant="admin">Product</TableCell>
            <TableCell isHeader variant="admin">Qty</TableCell>
            <TableCell isHeader variant="admin">Vendor Cost</TableCell>
            <TableCell isHeader variant="admin">Delivery</TableCell>
            <TableCell isHeader variant="admin">Invoiced</TableCell>
            <TableCell isHeader variant="admin">Invoice No</TableCell>
            <TableCell isHeader variant="admin">Invoice Cost</TableCell>
            <TableCell isHeader variant="admin">PO No</TableCell>
            <TableCell isHeader variant="admin">Actions</TableCell>
          </TableRow></TableHeader>
          <TableBody variant="admin">
            {loading ? <TableStateRow colSpan={10}>Loading Project procurement…</TableStateRow> : null}
            {!loading && !error && (ledger?.requirements.length ?? 0) === 0 ? <TableStateRow colSpan={10}>No confirmed Project purchases yet.</TableStateRow> : null}
            {!loading && !error ? (ledger?.requirements ?? []).map((requirement) => {
              const commitments = activeCommitments(requirement);
              return (
                <TableRow key={requirement.id}>
                  <TableCell variant="admin"><div className="space-y-2"><p className="font-medium">{requirement.vendorName || "—"}</p><Badge color={attentionColor(requirement.attentionState)}>{attentionLabel(requirement.attentionState)}</Badge></div></TableCell>
                  <TableCell variant="admin"><div className="space-y-1"><p className={`font-medium ${ADMIN_TEXT_STYLES.strong}`}>{requirement.productName}</p><p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{requirement.sku} · {sourceLabel(requirement.sourceKind)} · {requirement.orderNumber}</p></div></TableCell>
                  <TableCell variant="admin"><div className="space-y-1"><p>Required: {requirement.requiredQuantity ?? "—"}</p><p>Ordered: {requirement.activeCommittedQuantity}</p>{(requirement.openQuantity ?? 0) > 0 ? <p>Open: {requirement.openQuantity}</p> : null}{requirement.excessOrderedQuantity > 0 ? <p>Excess: {requirement.excessOrderedQuantity}</p> : null}</div></TableCell>
                  <TableCell variant="admin">{vendorCost(requirement)}</TableCell>
                  <TableCell variant="admin">{deliveryDisplay(commitments)}</TableCell>
                  <TableCell variant="admin">{invoiceDisplay(commitments)}</TableCell>
                  <TableCell variant="admin"><div className="space-y-1">{commitments.flatMap((commitment) => commitment.invoices).length === 0 ? "—" : commitments.flatMap((commitment) => commitment.invoices).map((invoice) => <p key={invoice.allocationId}>{invoice.invoiceNumber}</p>)}</div></TableCell>
                  <TableCell variant="admin"><div className="space-y-1">{commitments.flatMap((commitment) => commitment.invoices).length === 0 ? "—" : commitments.map((commitment) => commitment.invoiceCost > 0 ? <p key={commitment.id}>{money(commitment.invoiceCost, commitment.currencyCode)}</p> : null)}</div></TableCell>
                  <TableCell variant="admin"><div className="space-y-1">{requirement.commitments.length === 0 ? "—" : requirement.commitments.map((commitment) => <p key={commitment.id}>{commitment.vendorOrderNo}{commitment.status === "cancelled" ? " (Cancelled)" : ""}</p>)}</div></TableCell>
                  <TableCell variant="admin"><div className="space-y-3"><ProjectProcurementOrderActions requirement={requirement} canManage={canManageProcurement} onChanged={load} /><ProjectProcurementReceiptInvoiceActions requirement={requirement} canManageProcurement={canManageProcurement} canManageInvoices={canManageInvoices} onChanged={load} /></div></TableCell>
                </TableRow>
              );
            }) : null}
          </TableBody>
        </Table>
      </TableViewport>
    </ComponentCard>
  );
}
