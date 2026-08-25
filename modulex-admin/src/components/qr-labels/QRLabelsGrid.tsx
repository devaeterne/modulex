"use client";

import React, { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase/client";

type QRLabel = {
  location_id: string;
  warehouse_code: string;
  warehouse_name: string;
  zone_code: string | null;
  zone_name: string | null;
  location_code: string;
  location_name: string;
  location_type: string;
  qr_code: string;
  label_title: string;
  label_subtitle: string;
  label_footer: string;
};

function formatLocationType(type: string) {
  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function QRLabelsGrid() {
  const [labels, setLabels] = useState<QRLabel[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadLabels() {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase.rpc("get_printable_location_labels", {
      p_warehouse_id: null,
      p_zone_id: null,
    });

    if (error) {
      setErrorMessage(error.message);
      setLabels([]);
      setIsLoading(false);
      return;
    }

    setLabels((data as QRLabel[]) ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    loadLabels();
  }, []);

  const filteredLabels = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) return labels;

    return labels.filter((label) =>
      [
        label.warehouse_code,
        label.warehouse_name,
        label.zone_code,
        label.zone_name,
        label.location_code,
        label.location_name,
        label.location_type,
        label.qr_code,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [labels, query]);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Printable Shelf Labels
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Generate and print QR labels for warehouse shelf locations.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="text"
              placeholder="Search warehouse, zone, location..."
              className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 sm:w-[320px]"
            />

            <button
              type="button"
              onClick={loadLabels}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
            >
              Print Labels
            </button>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="print:hidden rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="print:hidden flex min-h-[320px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading QR labels...
            </p>
          </div>
        </div>
      ) : filteredLabels.length === 0 ? (
        <div className="print:hidden rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          No QR labels found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 print:grid-cols-2 sm:grid-cols-2 xl:grid-cols-3">
          {filteredLabels.map((label) => (
            <div
              key={label.location_id}
              className="break-inside-avoid rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 print:border print:border-black print:shadow-none"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-xl font-bold text-gray-900 dark:text-white print:text-black">
                    {label.label_title}
                  </h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 print:text-black">
                    {label.label_subtitle}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-500 print:text-black">
                    Type: {formatLocationType(label.location_type)}
                  </p>
                </div>

                <div className="rounded-xl bg-white p-2">
                  <QRCodeSVG value={label.qr_code} size={112} level="M" />
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03] print:bg-white print:p-0">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 print:text-black">
                  QR Payload
                </p>
                <p className="mt-1 break-all text-xs text-gray-700 dark:text-gray-300 print:text-black">
                  {label.qr_code}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 print:text-black">
                <span>{label.warehouse_name}</span>
                <span>{label.zone_name || "No zone"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}