"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type StoreColor = {
  code: string;
  display_name: string;
  swatch_hex: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
};

const fieldClass =
  "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-theme-xs outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300";

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export default function StoreColorsManager() {
  const [colors, setColors] = useState<StoreColor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadColors = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("store_color_options")
      .select("code,display_name,swatch_hex,image_url,sort_order,is_active")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setColors([]);
      setIsLoading(false);
      return;
    }

    setColors((data ?? []) as StoreColor[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadColors();
  }, [loadColors]);

  function patchColor(code: string, patch: Partial<StoreColor>) {
    setColors((current) =>
      current.map((color) => (color.code === code ? { ...color, ...patch } : color))
    );
    setSuccessMessage(null);
  }

  async function saveColor(color: StoreColor) {
    const displayName = color.display_name.trim();
    const swatchHex = color.swatch_hex?.trim() || null;

    if (!displayName) {
      setErrorMessage(`${color.code}: display name is required.`);
      return;
    }

    if (swatchHex && !HEX_PATTERN.test(swatchHex)) {
      setErrorMessage(`${color.code}: swatch must use a six-digit hex value such as #A1B2C3.`);
      return;
    }

    setSavingCode(color.code);
    setErrorMessage(null);
    setSuccessMessage(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage(userError?.message ?? "Unable to verify the current user.");
      setSavingCode(null);
      return;
    }

    const { error } = await supabase
      .from("store_color_options")
      .update({
        display_name: displayName,
        swatch_hex: swatchHex,
        image_url: color.image_url?.trim() || null,
        sort_order: Number.isFinite(color.sort_order) ? color.sort_order : 0,
        is_active: color.is_active,
        updated_by: user.id,
      })
      .eq("code", color.code);

    if (error) {
      setErrorMessage(error.message);
      setSavingCode(null);
      return;
    }

    setColors((current) =>
      current.map((item) =>
        item.code === color.code
          ? { ...item, display_name: displayName, swatch_hex: swatchHex }
          : item
      )
    );
    setSuccessMessage(`${color.code} saved.`);
    setSavingCode(null);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Public Color Presentation</h2>
        <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
          Product color codes remain the master identifiers. Change only their public label, visual swatch,
          optional image, ordering, or visibility. No meaning is hard-coded for NB, NT, WH, or future codes.
        </p>
      </div>

      {(errorMessage || successMessage) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            errorMessage
              ? "border-error-200 bg-error-50 text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
              : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
          }`}
        >
          {errorMessage ?? successMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>
                {[
                  "Code",
                  "Public name",
                  "Swatch",
                  "Optional image URL",
                  "Order",
                  "Active",
                  "Action",
                ].map((label) => (
                  <th
                    key={label}
                    className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    Loading Store colors...
                  </td>
                </tr>
              ) : colors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    No Store color options found.
                  </td>
                </tr>
              ) : (
                colors.map((color) => (
                  <tr key={color.code}>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-white/5 dark:text-gray-300">
                        {color.code}
                      </span>
                    </td>
                    <td className="min-w-[220px] px-5 py-4">
                      <input
                        value={color.display_name}
                        onChange={(event) => patchColor(color.code, { display_name: event.target.value })}
                        className={fieldClass}
                      />
                    </td>
                    <td className="min-w-[180px] px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-9 w-9 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700"
                          style={{ backgroundColor: color.swatch_hex || "transparent" }}
                          title={color.swatch_hex || "No swatch"}
                        />
                        <input
                          value={color.swatch_hex ?? ""}
                          onChange={(event) => patchColor(color.code, { swatch_hex: event.target.value })}
                          placeholder="#A1B2C3"
                          className={fieldClass}
                        />
                      </div>
                    </td>
                    <td className="min-w-[280px] px-5 py-4">
                      <input
                        type="url"
                        value={color.image_url ?? ""}
                        onChange={(event) => patchColor(color.code, { image_url: event.target.value })}
                        placeholder="https://..."
                        className={fieldClass}
                      />
                    </td>
                    <td className="w-[120px] px-5 py-4">
                      <input
                        type="number"
                        value={color.sort_order}
                        onChange={(event) => patchColor(color.code, { sort_order: Number(event.target.value) || 0 })}
                        className={fieldClass}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={color.is_active}
                          onChange={(event) => patchColor(color.code, { is_active: event.target.checked })}
                          className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                        />
                        {color.is_active ? "Active" : "Hidden"}
                      </label>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        disabled={savingCode === color.code}
                        onClick={() => void saveColor(color)}
                        className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingCode === color.code ? "Saving..." : "Save"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
