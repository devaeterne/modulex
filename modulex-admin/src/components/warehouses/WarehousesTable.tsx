"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableViewport,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";

type WarehouseType = "sellable" | "non_sellable";

type WarehouseRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  warehouse_type: WarehouseType;
  is_active: boolean;
  qr_code: string | null;
  qr_payload: string | null;
  qr_svg_url: string | null;
  created_at: string;
  updated_at: string;
  zone_count?: number;
  location_count?: number;
};

function formatWarehouseType(type: WarehouseType) {
  switch (type) {
    case "sellable":
      return "Sellable";
    case "non_sellable":
      return "Non-sellable";
    default:
      return type;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function WarehousesTable() {
  const router = useRouter();

  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  const filteredWarehouses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return warehouses;

    return warehouses.filter((warehouse) => {
      const searchableText = [
        warehouse.code,
        warehouse.name,
        warehouse.description,
        warehouse.warehouse_type,
        warehouse.qr_code,
        warehouse.qr_payload,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [warehouses, query]);

  async function loadWarehouses() {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("warehouses")
      .select(
        `
        id,
        name,
        code,
        description,
        address,
        city,
        country,
        warehouse_type,
        is_active,
        qr_code,
        qr_payload,
        qr_svg_url,
        created_at,
        updated_at,
        zones(id),
        locations(id)
      `
      )
      .order("code", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setWarehouses([]);
      setIsLoading(false);
      return;
    }

    const mappedRows =
      data?.map((warehouse: any) => ({
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        description: warehouse.description,
        address: warehouse.address,
        city: warehouse.city,
        country: warehouse.country,
        warehouse_type: warehouse.warehouse_type ?? "sellable",
        is_active: warehouse.is_active,
        qr_code: warehouse.qr_code,
        qr_payload: warehouse.qr_payload,
        qr_svg_url: warehouse.qr_svg_url,
        created_at: warehouse.created_at,
        updated_at: warehouse.updated_at,
        zone_count: warehouse.zones?.length ?? 0,
        location_count: warehouse.locations?.length ?? 0,
      })) ?? [];

    setWarehouses(mappedRows);
    setIsLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    void getCurrentProfile().then(({ profile }) => {
      if (mounted) {
        setCanManage(
          profile ? hasPermission(profile.role, "warehouse.manage") : false
        );
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    loadWarehouses();
  }, []);

  function openWarehouseEdit(warehouseId: string) {
    if (!canManage) return;
    router.push(`/warehouses/${warehouseId}/edit`);
  }

  async function handleToggleStatus(warehouse: WarehouseRow) {
    if (!canManage) return;
    setActionLoadingId(warehouse.id);
    setErrorMessage(null);

    const { error } = await supabase
      .from("warehouses")
      .update({ is_active: !warehouse.is_active })
      .eq("id", warehouse.id);

    if (error) {
      setErrorMessage(error.message);
      setActionLoadingId(null);
      return;
    }

    await loadWarehouses();
    setActionLoadingId(null);
  }

  return (
    <ComponentCard
      title="Warehouse List"
      desc="Manage sellable and non-sellable warehouses used in QR-based stock operations."
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="w-full sm:w-[300px]">
          <Input
            id="warehouse-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search code, name, type, QR..."
          />
        </div>

        {canManage ? (
          <Link
            href="/warehouses/new"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          >
            Add Warehouse
          </Link>
        ) : null}
      </div>

      {errorMessage ? (
        <div className="mb-5">
          <Alert variant="error" title="Warehouse action failed" message={errorMessage} />
        </div>
      ) : null}

      <TableViewport>
        <Table variant="admin" className="min-w-[1080px]">
          <TableHeader variant="admin">
            <TableRow>
              {["Warehouse", "Type", "QR", "Structure", "Status", "Updated"].map((label) => (
                <TableCell key={label} isHeader variant="admin" className="text-left">
                  {label}
                </TableCell>
              ))}
              <TableCell isHeader variant="admin" className="text-right">
                Actions
              </TableCell>
            </TableRow>
          </TableHeader>

          <TableBody variant="admin">
            {isLoading ? (
              <TableRow>
                <TableCell variant="admin" colSpan={7} className="py-8 text-center">
                  Loading warehouses...
                </TableCell>
              </TableRow>
            ) : filteredWarehouses.length === 0 ? (
              <TableRow>
                <TableCell variant="admin" colSpan={7} className="py-8 text-center">
                  No warehouses found.
                </TableCell>
              </TableRow>
            ) : (
              filteredWarehouses.map((warehouse) => {
                const isActionLoading = actionLoadingId === warehouse.id;

                return (
                  <TableRow
                    key={warehouse.id}
                    onDoubleClick={canManage ? () => openWarehouseEdit(warehouse.id) : undefined}
                    title={canManage ? "Double click to edit" : undefined}
                    className={canManage ? "cursor-pointer" : undefined}
                  >
                    <TableCell variant="admin" className="align-top">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-800 dark:text-white/90">
                            {warehouse.code}
                          </span>
                          <Badge color="light" size="sm">
                            {warehouse.name}
                          </Badge>
                        </div>
                        <p className="max-w-[420px] text-xs text-gray-500 dark:text-gray-400">
                          {warehouse.description || "No description."}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      <Badge
                        color={warehouse.warehouse_type === "sellable" ? "success" : "warning"}
                        size="sm"
                      >
                        {formatWarehouseType(warehouse.warehouse_type)}
                      </Badge>
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-800 dark:text-white/90">
                          {warehouse.qr_code || "-"}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {warehouse.qr_payload || "-"}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      <div className="flex flex-wrap gap-2">
                        <Badge color="light" size="sm">
                          {warehouse.zone_count ?? 0} Zones
                        </Badge>
                        <Badge color="light" size="sm">
                          {warehouse.location_count ?? 0} Shelves
                        </Badge>
                      </div>
                    </TableCell>

                    <TableCell variant="admin" className="align-top">
                      <Badge color={warehouse.is_active ? "success" : "light"} size="sm">
                        {warehouse.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>

                    <TableCell variant="admin" className="align-top text-gray-500 dark:text-gray-400">
                      {formatDate(warehouse.updated_at)}
                    </TableCell>

                    <TableCell variant="admin" className="align-top text-right">
                      <div className="flex min-w-[260px] items-center justify-end gap-2">
                        {canManage ? (
                          <Link
                            href={`/warehouses/${warehouse.id}/edit`}
                            onClick={(event) => event.stopPropagation()}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                          >
                            Edit
                          </Link>
                        ) : null}

                        <Link
                          href={`/zones?warehouse=${warehouse.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                        >
                          Zones
                        </Link>

                        {canManage ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isActionLoading}
                            onClick={() => void handleToggleStatus(warehouse)}
                          >
                            {warehouse.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableViewport>
    </ComponentCard>
  );
}
