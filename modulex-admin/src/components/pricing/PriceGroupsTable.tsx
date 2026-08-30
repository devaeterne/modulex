"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { hasPermission } from "@/lib/auth/permissions";

type PriceGroup = {
  id: string;
  system_key: string;
  name: string;
  sort_order: number;
  is_base_price: boolean;
  is_active: boolean;
  color_key: string | null;
  created_at: string;
  updated_at: string;
};

const COLOR_KEYS = [
  "blue",
  "purple",
  "amber",
  "rose",
  "cyan",
  "orange",
  "pink",
  "indigo",
  "teal",
  "lime",
  "emerald",
  "sky",
] as const;

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

export default function PriceGroupsTable() {
  const [priceGroups, setPriceGroups] = useState<PriceGroup[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [canManage, setCanManage] = useState(false);

  const [newGroupName, setNewGroupName] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const [savingId, setSavingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const sortedPriceGroups = useMemo(() => {
    return [...priceGroups].sort((a, b) => {
      if (a.is_base_price && !b.is_base_price) {
        return -1;
      }

      if (!a.is_base_price && b.is_base_price) {
        return 1;
      }

      return a.sort_order - b.sort_order;
    });
  }, [priceGroups]);

  const nonBaseGroups = useMemo(() => {
    return sortedPriceGroups.filter(
      (group) => !group.is_base_price
    );
  }, [sortedPriceGroups]);

  const totalGroups = priceGroups.length;

  const activeGroups = priceGroups.filter(
    (group) => group.is_active
  ).length;

  const inactiveGroups = totalGroups - activeGroups;

  async function loadPriceGroups() {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("price_groups")
      .select(
        `
          id,
          system_key,
          name,
          sort_order,
          is_base_price,
          is_active,
          color_key,
          created_at,
          updated_at
        `
      )
      .order("sort_order", {
        ascending: true,
      });

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    setPriceGroups((data as PriceGroup[]) ?? []);
    setIsLoading(false);
  }

  useEffect(() => {
    async function initialize() {
      const { profile } = await getCurrentProfile();

      setCanManage(hasPermission(profile?.roles, "pricing.manage"));

      await loadPriceGroups();
    }

    initialize();
  }, []);

  function clearMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function getBadgeClass(group: PriceGroup) {
    if (group.is_base_price) {
      return priceGroupBadgeClasses.brand;
    }

    if (
      group.color_key &&
      priceGroupBadgeClasses[group.color_key]
    ) {
      return priceGroupBadgeClasses[group.color_key];
    }

    return "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300";
  }

  function generateSystemKey() {
    const randomPart = crypto
      .randomUUID()
      .replaceAll("-", "")
      .slice(0, 12);

    return `tier_${randomPart}`;
  }

  function getNextSortOrder() {
    if (priceGroups.length === 0) {
      return 10;
    }

    const highest = Math.max(
      ...priceGroups.map(
        (group) => group.sort_order
      )
    );

    return highest + 10;
  }

  function getNextColorKey() {
    const usedColors = new Set(
      priceGroups
        .filter(
          (group) =>
            !group.is_base_price &&
            group.color_key
        )
        .map((group) => group.color_key)
    );

    const unusedColor = COLOR_KEYS.find(
      (color) => !usedColors.has(color)
    );

    if (unusedColor) {
      return unusedColor;
    }

    /*
     * Eğer ileride mevcut palette'ten daha fazla
     * fiyat grubu oluşursa renkler tekrar kullanılmaya
     * başlanır. Normal kullanımda ilk 12 tier benzersizdir.
     */
    return COLOR_KEYS[
      nonBaseGroups.length % COLOR_KEYS.length
    ];
  }

  function hasDuplicateName(
    name: string,
    excludeId?: string
  ) {
    const normalizedName = name
      .trim()
      .toLowerCase();

    return priceGroups.some(
      (group) =>
        group.id !== excludeId &&
        group.name.trim().toLowerCase() ===
        normalizedName
    );
  }

  async function handleCreateGroup(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const name = newGroupName.trim();

    if (!name) {
      setErrorMessage(
        "Price group name is required."
      );
      return;
    }

    if (hasDuplicateName(name)) {
      setErrorMessage(
        "A price group with this name already exists."
      );
      return;
    }

    setIsCreating(true);
    clearMessages();

    const { error } = await supabase
      .from("price_groups")
      .insert({
        system_key: generateSystemKey(),
        name,
        sort_order: getNextSortOrder(),
        is_base_price: false,
        is_active: true,
        color_key: getNextColorKey(),
      });

    if (error) {
      setErrorMessage(error.message);
      setIsCreating(false);
      return;
    }

    setNewGroupName("");

    setSuccessMessage(
      "Price group created successfully."
    );

    setIsCreating(false);

    await loadPriceGroups();
  }

  function startEdit(group: PriceGroup) {
    setEditingId(group.id);
    setEditingName(group.name);

    clearMessages();
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveEdit(
    group: PriceGroup
  ) {
    const name = editingName.trim();

    if (!name) {
      setErrorMessage(
        "Price group name is required."
      );
      return;
    }

    if (hasDuplicateName(name, group.id)) {
      setErrorMessage(
        "A price group with this name already exists."
      );
      return;
    }

    if (name === group.name) {
      cancelEdit();
      return;
    }

    setSavingId(group.id);
    clearMessages();

    const { error } = await supabase
      .from("price_groups")
      .update({
        name,
      })
      .eq("id", group.id);

    if (error) {
      setErrorMessage(error.message);
      setSavingId(null);
      return;
    }

    setEditingId(null);
    setEditingName("");

    setSuccessMessage(
      "Price group updated successfully."
    );

    setSavingId(null);

    await loadPriceGroups();
  }

  async function toggleActive(
    group: PriceGroup
  ) {
    if (
      group.is_base_price &&
      group.is_active
    ) {
      setErrorMessage(
        "Base price group cannot be deactivated."
      );
      return;
    }

    const nextStatus = !group.is_active;

    setSavingId(group.id);
    clearMessages();

    const { error } = await supabase
      .from("price_groups")
      .update({
        is_active: nextStatus,
      })
      .eq("id", group.id);

    if (error) {
      setErrorMessage(error.message);
      setSavingId(null);
      return;
    }

    setSuccessMessage(
      nextStatus
        ? "Price group activated successfully."
        : "Price group deactivated successfully."
    );

    setSavingId(null);

    await loadPriceGroups();
  }

  async function moveGroup(
    group: PriceGroup,
    direction: "up" | "down"
  ) {
    if (group.is_base_price) {
      return;
    }

    const currentIndex =
      nonBaseGroups.findIndex(
        (item) => item.id === group.id
      );

    if (currentIndex === -1) {
      return;
    }

    const targetIndex =
      direction === "up"
        ? currentIndex - 1
        : currentIndex + 1;

    if (
      targetIndex < 0 ||
      targetIndex >= nonBaseGroups.length
    ) {
      return;
    }

    const targetGroup =
      nonBaseGroups[targetIndex];

    const currentOrder =
      group.sort_order;

    const targetOrder =
      targetGroup.sort_order;

    setReorderingId(group.id);
    clearMessages();

    /*
     * İlk satırın sırasını diğerinin değeriyle değiştiriyoruz.
     */
    const { error: firstError } =
      await supabase
        .from("price_groups")
        .update({
          sort_order: targetOrder,
        })
        .eq("id", group.id);

    if (firstError) {
      setErrorMessage(
        firstError.message
      );
      setReorderingId(null);
      return;
    }

    /*
     * Ardından ikinci satırı ilk satırın eski sırasına alıyoruz.
     */
    const { error: secondError } =
      await supabase
        .from("price_groups")
        .update({
          sort_order: currentOrder,
        })
        .eq("id", targetGroup.id);

    if (secondError) {
      /*
       * İkinci update başarısız olursa ilk değişikliği
       * geri almaya çalışıyoruz.
       */
      await supabase
        .from("price_groups")
        .update({
          sort_order: currentOrder,
        })
        .eq("id", group.id);

      setErrorMessage(
        secondError.message
      );

      setReorderingId(null);
      await loadPriceGroups();
      return;
    }

    setSuccessMessage(
      "Price group order updated."
    );

    setReorderingId(null);

    await loadPriceGroups();
  }

  function canMoveUp(
    group: PriceGroup
  ) {
    if (group.is_base_price) {
      return false;
    }

    const index =
      nonBaseGroups.findIndex(
        (item) => item.id === group.id
      );

    return index > 0;
  }

  function canMoveDown(
    group: PriceGroup
  ) {
    if (group.is_base_price) {
      return false;
    }

    const index =
      nonBaseGroups.findIndex(
        (item) => item.id === group.id
      );

    return (
      index >= 0 &&
      index <
      nonBaseGroups.length - 1
    );
  }

  function getDisplayPosition(
    group: PriceGroup
  ) {
    return (
      sortedPriceGroups.findIndex(
        (item) => item.id === group.id
      ) + 1
    );
  }

  const isBusy =
    savingId !== null ||
    reorderingId !== null ||
    isCreating;
  async function deleteGroup(group: PriceGroup) {
    if (group.is_base_price) {
      setErrorMessage("Base price group cannot be deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Delete price group "${group.name}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setSavingId(group.id);
    clearMessages();

    const { error } = await supabase
      .from("price_groups")
      .delete()
      .eq("id", group.id);

    if (error) {
      if (
        error.message.toLowerCase().includes("foreign key") ||
        error.code === "23503"
      ) {
        setErrorMessage(
          `"${group.name}" cannot be deleted because it already has product price records. Deactivate it instead.`
        );
      } else {
        setErrorMessage(error.message);
      }

      setSavingId(null);
      return;
    }

    setSuccessMessage(
      "Price group deleted successfully."
    );

    setSavingId(null);

    await loadPriceGroups();
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {/* Header */}

      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Price Groups
            </h3>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage pricing levels used for
              product pricing and customer
              price assignments.
            </p>
          </div>

          {!isLoading && (
            <div className="flex flex-wrap gap-2">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/40">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Total
                </div>

                <div className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {totalGroups}
                </div>
              </div>

              <div className="rounded-lg border border-success-200 bg-success-50 px-3 py-2 dark:border-success-500/30 dark:bg-success-500/10">
                <div className="text-xs text-success-600 dark:text-success-400">
                  Active
                </div>

                <div className="text-sm font-semibold text-success-700 dark:text-success-400">
                  {activeGroups}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/40">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Inactive
                </div>

                <div className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  {inactiveGroups}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-5">
        {/* Error */}

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            {errorMessage}
          </div>
        )}

        {/* Success */}

        {successMessage && (
          <div className="mb-4 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">
            {successMessage}
          </div>
        )}

        {/* Add Price Group */}

        {canManage && (
          <form
            onSubmit={handleCreateGroup}
            className="mb-5 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                New Price Group
              </label>

              <input
                value={newGroupName}
                onChange={(event) =>
                  setNewGroupName(
                    event.target.value
                  )
                }
                type="text"
                placeholder="Example: Dealer, VIP, A..."
                disabled={isBusy}
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
              />

              <p className="mt-1.5 text-xs text-gray-400">
                System key, color and position
                are assigned automatically.
              </p>
            </div>

            <button
              type="submit"
              disabled={
                isBusy ||
                !newGroupName.trim()
              }
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating
                ? "Adding..."
                : "+ Add Price Group"}
            </button>
          </form>
        )}

        {/* Loading */}

        {isLoading ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />

              <p className="text-sm text-gray-500 dark:text-gray-400">
                Loading price groups...
              </p>
            </div>
          </div>
        ) : (
          /* Table */

          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Price Group
                    </th>

                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Type
                    </th>

                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Status
                    </th>

                    <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Position
                    </th>

                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      System Key
                    </th>

                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Updated
                    </th>

                    {canManage && (
                      <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-transparent">
                  {sortedPriceGroups.length === 0 ? (
                    <tr>
                      <td
                        colSpan={
                          canManage ? 7 : 6
                        }
                        className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400"
                      >
                        No price groups found.
                      </td>
                    </tr>
                  ) : (
                    sortedPriceGroups.map(
                      (group) => (
                        <tr
                          key={group.id}
                          className={
                            !group.is_active
                              ? "bg-gray-50/60 opacity-70 dark:bg-white/[0.015]"
                              : ""
                          }
                        >
                          {/* Name */}

                          <td className="px-5 py-4">
                            {editingId ===
                              group.id ? (
                              <input
                                value={
                                  editingName
                                }
                                onChange={(
                                  event
                                ) =>
                                  setEditingName(
                                    event.target
                                      .value
                                  )
                                }
                                onKeyDown={(
                                  event
                                ) => {
                                  if (
                                    event.key ===
                                    "Enter"
                                  ) {
                                    saveEdit(
                                      group
                                    );
                                  }

                                  if (
                                    event.key ===
                                    "Escape"
                                  ) {
                                    cancelEdit();
                                  }
                                }}
                                autoFocus
                                disabled={
                                  savingId ===
                                  group.id
                                }
                                type="text"
                                className="h-10 w-full min-w-[180px] rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
                              />
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getBadgeClass(
                                    group
                                  )}`}
                                >
                                  {
                                    group.name
                                  }
                                </span>

                                {group.is_base_price && (
                                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-white/10 dark:text-gray-400">
                                    System
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Type */}

                          <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                            {group.is_base_price
                              ? "Base Price"
                              : "Price Tier"}
                          </td>

                          {/* Status */}

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${group.is_active
                                ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
                                : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400"
                                }`}
                            >
                              {group.is_active
                                ? "Active"
                                : "Inactive"}
                            </span>
                          </td>

                          {/* Position */}

                          <td className="px-5 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <span className="min-w-[30px] text-center text-sm font-medium text-gray-600 dark:text-gray-300">
                                #
                                {getDisplayPosition(
                                  group
                                )}
                              </span>

                              {canManage &&
                                !group.is_base_price && (
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        moveGroup(
                                          group,
                                          "up"
                                        )
                                      }
                                      disabled={
                                        isBusy ||
                                        !canMoveUp(
                                          group
                                        )
                                      }
                                      title="Move up"
                                      className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-white"
                                    >
                                      ↑
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        moveGroup(
                                          group,
                                          "down"
                                        )
                                      }
                                      disabled={
                                        isBusy ||
                                        !canMoveDown(
                                          group
                                        )
                                      }
                                      title="Move down"
                                      className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-white"
                                    >
                                      ↓
                                    </button>
                                  </div>
                                )}
                            </div>
                          </td>

                          {/* System Key */}

                          <td className="px-5 py-4">
                            <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500 dark:bg-white/10 dark:text-gray-400">
                              {
                                group.system_key
                              }
                            </code>
                          </td>

                          {/* Updated */}

                          <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                            {new Date(
                              group.updated_at
                            ).toLocaleDateString(
                              "en-US"
                            )}
                          </td>

                          {/* Actions */}

                          {canManage && (
                            <td className="px-5 py-4">
                              <div className="flex justify-end gap-2">
                                {editingId ===
                                  group.id ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        saveEdit(
                                          group
                                        )
                                      }
                                      disabled={
                                        savingId ===
                                        group.id
                                      }
                                      className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {savingId ===
                                        group.id
                                        ? "Saving..."
                                        : "Save"}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={
                                        cancelEdit
                                      }
                                      disabled={
                                        savingId ===
                                        group.id
                                      }
                                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        startEdit(
                                          group
                                        )
                                      }
                                      disabled={
                                        isBusy
                                      }
                                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                                    >
                                      Edit
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleActive(
                                          group
                                        )
                                      }
                                      disabled={
                                        isBusy ||
                                        (group.is_base_price &&
                                          group.is_active)
                                      }
                                      title={
                                        group.is_base_price &&
                                          group.is_active
                                          ? "Base price group must remain active"
                                          : undefined
                                      }
                                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${group.is_active
                                        ? "border-warning-200 text-warning-700 hover:bg-warning-50 dark:border-warning-500/30 dark:text-warning-400"
                                        : "border-success-200 text-success-700 hover:bg-success-50 dark:border-success-500/30 dark:text-success-400"
                                        }`}
                                    >
                                      {savingId ===
                                        group.id
                                        ? "Saving..."
                                        : group.is_active
                                          ? "Deactivate"
                                          : "Activate"}
                                    </button>
                                  </>
                                )}
                                {!group.is_base_price && (
                                  <button
                                    type="button"
                                    onClick={() => deleteGroup(group)}
                                    disabled={isBusy}
                                    className="rounded-lg border border-error-200 px-3 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-500/30 dark:text-error-400 dark:hover:bg-error-500/10"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!isLoading && (
          <div className="mt-4 flex flex-col gap-1 text-xs text-gray-400">
            <p>
              Base Price is a required system
              group and always remains first
              and active.
            </p>

            <p>
              Price group order will also
              determine the column order on
              the Product Prices screen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
