"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";
import type { CustomerOrderRevision } from "@/lib/customers/types";

type RevisionActor = { full_name: string | null; email: string | null };
type RevisionRow = CustomerOrderRevision & { actor: RevisionActor | RevisionActor[] | null };
type DisplayRevision = CustomerOrderRevision & { actor: RevisionActor | null };

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function normalizeActor(actor: RevisionRow["actor"]): RevisionActor | null {
  if (Array.isArray(actor)) return actor[0] ?? null;
  return actor ?? null;
}

function revisionActor(revision: DisplayRevision) {
  if (!revision.revised_by) return "System";
  return revision.actor?.full_name || revision.actor?.email || "Modulex user";
}

export default function CustomerOrderRevisionHistory() {
  const params = useParams<{ orderId: string }>();
  const [revisions, setRevisions] = useState<DisplayRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: loadError } = await supabase
        .from("customer_order_revisions")
        .select("id, order_id, revision_number, reason, order_snapshot, items_snapshot, revised_by, created_at, actor:profiles!customer_order_revisions_revised_by_fkey(full_name, email)")
        .eq("order_id", params.orderId)
        .order("revision_number", { ascending: false });
      if (loadError) throw loadError;
      const rows = (data ?? []) as unknown as RevisionRow[];
      setRevisions(rows.map((row) => ({ ...row, actor: normalizeActor(row.actor) })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Order revisions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [params.orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ComponentCard title="Order Revisions" desc="Previous Order versions are preserved automatically, newest first.">
      {error ? (
        <div className="space-y-3" role="alert">
          <Alert variant="error" title="Order revisions could not be loaded" message={error} />
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Retry</Button>
        </div>
      ) : (
        <TableViewport>
          <Table variant="admin" minWidth="standard">
            <TableHeader variant="admin">
              <TableRow>
                <TableCell isHeader variant="admin">Revision</TableCell>
                <TableCell isHeader variant="admin">Reason</TableCell>
                <TableCell isHeader variant="admin">By</TableCell>
                <TableCell isHeader variant="admin">When</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="admin">
              {loading ? <TableStateRow colSpan={4}>Loading Order revisions…</TableStateRow> : null}
              {!loading && revisions.length === 0 ? <TableStateRow colSpan={4}>No Order revisions have been recorded yet.</TableStateRow> : null}
              {!loading ? revisions.map((revision) => (
                <TableRow key={revision.id}>
                  <TableCell variant="admin">Revision {revision.revision_number}</TableCell>
                  <TableCell variant="admin">{revision.reason || "No revision reason provided"}</TableCell>
                  <TableCell variant="admin">{revisionActor(revision)}</TableCell>
                  <TableCell variant="admin">{dateTime(revision.created_at)}</TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </TableViewport>
      )}
    </ComponentCard>
  );
}
