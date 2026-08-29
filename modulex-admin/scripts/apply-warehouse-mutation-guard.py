from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1))


# Warehouses
path = "src/components/warehouses/WarehousesTable.tsx"
replace_once(
    path,
    'import { supabase } from "@/lib/supabase/client";\n',
    'import { supabase } from "@/lib/supabase/client";\nimport { getCurrentProfile } from "@/lib/supabase/profile";\nimport { hasPermission } from "@/lib/auth/permissions";\n',
)
replace_once(
    path,
    '  const [errorMessage, setErrorMessage] = useState<string | null>(null);\n',
    '  const [errorMessage, setErrorMessage] = useState<string | null>(null);\n  const [canManage, setCanManage] = useState(false);\n',
)
replace_once(
    path,
    '  useEffect(() => {\n    loadWarehouses();\n  }, []);\n',
    '  useEffect(() => {\n    let mounted = true;\n\n    void getCurrentProfile().then(({ profile }) => {\n      if (mounted) {\n        setCanManage(\n          profile ? hasPermission(profile.role, "warehouse.manage") : false\n        );\n      }\n    });\n\n    return () => {\n      mounted = false;\n    };\n  }, []);\n\n  useEffect(() => {\n    loadWarehouses();\n  }, []);\n',
)
replace_once(
    path,
    '  function openWarehouseEdit(warehouseId: string) {\n    router.push(`/warehouses/${warehouseId}/edit`);\n  }\n',
    '  function openWarehouseEdit(warehouseId: string) {\n    if (!canManage) return;\n    router.push(`/warehouses/${warehouseId}/edit`);\n  }\n',
)
replace_once(
    path,
    '  async function handleToggleStatus(warehouse: WarehouseRow) {\n    setActionLoadingId(warehouse.id);\n',
    '  async function handleToggleStatus(warehouse: WarehouseRow) {\n    if (!canManage) return;\n    setActionLoadingId(warehouse.id);\n',
)
replace_once(
    path,
    '''          <Link\n            href="/warehouses/new"\n            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"\n          >\n            Add Warehouse\n          </Link>''',
    '''          {canManage && (\n            <Link\n              href="/warehouses/new"\n              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"\n            >\n              Add Warehouse\n            </Link>\n          )}''',
)
replace_once(
    path,
    '''                    onDoubleClick={() => openWarehouseEdit(warehouse.id)}\n                    title="Double click to edit"\n                    className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"''',
    '''                    onDoubleClick={canManage ? () => openWarehouseEdit(warehouse.id) : undefined}\n                    title={canManage ? "Double click to edit" : undefined}\n                    className={`${canManage ? "cursor-pointer " : ""}transition hover:bg-gray-50 dark:hover:bg-white/[0.03]`}''',
)
replace_once(
    path,
    '''                        <Link\n                          href={`/warehouses/${warehouse.id}/edit`}\n                          onClick={(event) => event.stopPropagation()}\n                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"\n                        >\n                          Edit\n                        </Link>''',
    '''                        {canManage && (\n                          <Link\n                            href={`/warehouses/${warehouse.id}/edit`}\n                            onClick={(event) => event.stopPropagation()}\n                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"\n                          >\n                            Edit\n                          </Link>\n                        )}''',
)
replace_once(
    path,
    '''                        <button\n                          type="button"\n                          onClick={(event) => {\n                            event.stopPropagation();\n                            handleToggleStatus(warehouse);\n                          }}\n                          disabled={isActionLoading}\n                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${warehouse.is_active\n                            ? "bg-warning-50 text-warning-700 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400"\n                            : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"\n                            }`}\n                        >\n                          {warehouse.is_active ? "Deactivate" : "Activate"}\n                        </button>''',
    '''                        {canManage && (\n                          <button\n                            type="button"\n                            onClick={(event) => {\n                              event.stopPropagation();\n                              handleToggleStatus(warehouse);\n                            }}\n                            disabled={isActionLoading}\n                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${warehouse.is_active\n                              ? "bg-warning-50 text-warning-700 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400"\n                              : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"\n                              }`}\n                          >\n                            {warehouse.is_active ? "Deactivate" : "Activate"}\n                          </button>\n                        )}''',
)

# Zones
path = "src/components/zones/ZonesTable.tsx"
replace_once(
    path,
    'import { supabase } from "@/lib/supabase/client";\n',
    'import { supabase } from "@/lib/supabase/client";\nimport { getCurrentProfile } from "@/lib/supabase/profile";\nimport { hasPermission } from "@/lib/auth/permissions";\n',
)
replace_once(
    path,
    '  const [errorMessage, setErrorMessage] = useState<string | null>(null);\n',
    '  const [errorMessage, setErrorMessage] = useState<string | null>(null);\n  const [canManage, setCanManage] = useState(false);\n',
)
replace_once(
    path,
    '  useEffect(() => {\n    loadZones();\n  }, [warehouseId]);\n',
    '  useEffect(() => {\n    let mounted = true;\n\n    void getCurrentProfile().then(({ profile }) => {\n      if (mounted) {\n        setCanManage(\n          profile ? hasPermission(profile.role, "warehouse.manage") : false\n        );\n      }\n    });\n\n    return () => {\n      mounted = false;\n    };\n  }, []);\n\n  useEffect(() => {\n    loadZones();\n  }, [warehouseId]);\n',
)
replace_once(
    path,
    '  function openZoneEdit(zoneId: string) {\n    router.push(`/zones/${zoneId}/edit`);\n  }\n',
    '  function openZoneEdit(zoneId: string) {\n    if (!canManage) return;\n    router.push(`/zones/${zoneId}/edit`);\n  }\n',
)
replace_once(
    path,
    '  async function handleToggleStatus(zone: ZoneRow) {\n    setActionLoadingId(zone.id);\n',
    '  async function handleToggleStatus(zone: ZoneRow) {\n    if (!canManage) return;\n    setActionLoadingId(zone.id);\n',
)
replace_once(
    path,
    '  async function handleDeleteZone(zone: ZoneRow) {\n    setErrorMessage(null);\n',
    '  async function handleDeleteZone(zone: ZoneRow) {\n    if (!canManage) return;\n    setErrorMessage(null);\n',
)
replace_once(
    path,
    '''          <Link\n            href={addZoneHref}\n            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"\n          >\n            Add Zone\n          </Link>''',
    '''          {canManage && (\n            <Link\n              href={addZoneHref}\n              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"\n            >\n              Add Zone\n            </Link>\n          )}''',
)
replace_once(
    path,
    '''                    onDoubleClick={() => openZoneEdit(zone.id)}\n                    title="Double click to edit"\n                    className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"''',
    '''                    onDoubleClick={canManage ? () => openZoneEdit(zone.id) : undefined}\n                    title={canManage ? "Double click to edit" : undefined}\n                    className={`${canManage ? "cursor-pointer " : ""}transition hover:bg-gray-50 dark:hover:bg-white/[0.03]`}''',
)
replace_once(
    path,
    '''                        <Link\n                          href={`/zones/${zone.id}/edit`}\n                          onClick={(event) => event.stopPropagation()}\n                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"\n                        >\n                          Edit\n                        </Link>''',
    '''                        {canManage && (\n                          <Link\n                            href={`/zones/${zone.id}/edit`}\n                            onClick={(event) => event.stopPropagation()}\n                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"\n                          >\n                            Edit\n                          </Link>\n                        )}''',
)
replace_once(
    path,
    '''                        <button\n                          type="button"\n                          onClick={(event) => {\n                            event.stopPropagation();\n                            handleToggleStatus(zone);\n                          }}\n                          disabled={isActionLoading}\n                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${zone.is_active\n                            ? "bg-warning-50 text-warning-700 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400"\n                            : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"\n                            }`}\n                        >\n                          {zone.is_active ? "Deactivate" : "Activate"}\n                        </button>''',
    '''                        {canManage && (\n                          <button\n                            type="button"\n                            onClick={(event) => {\n                              event.stopPropagation();\n                              handleToggleStatus(zone);\n                            }}\n                            disabled={isActionLoading}\n                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${zone.is_active\n                              ? "bg-warning-50 text-warning-700 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400"\n                              : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"\n                              }`}\n                          >\n                            {zone.is_active ? "Deactivate" : "Activate"}\n                          </button>\n                        )}''',
)
replace_once(
    path,
    '''                        <button\n                          type="button"\n                          onClick={(event) => {\n                            event.stopPropagation();\n                            handleDeleteZone(zone);\n                          }}\n                          disabled={isActionLoading}\n                          className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-medium text-error-600 transition hover:bg-error-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400 dark:hover:bg-error-500/20"\n                        >\n                          Delete\n                        </button>''',
    '''                        {canManage && (\n                          <button\n                            type="button"\n                            onClick={(event) => {\n                              event.stopPropagation();\n                              handleDeleteZone(zone);\n                            }}\n                            disabled={isActionLoading}\n                            className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-medium text-error-600 transition hover:bg-error-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400 dark:hover:bg-error-500/20"\n                          >\n                            Delete\n                          </button>\n                        )}''',
)

# Locations
path = "src/components/locations/LocationsTable.tsx"
replace_once(
    path,
    'import { supabase } from "@/lib/supabase/client";\n',
    'import { supabase } from "@/lib/supabase/client";\nimport { getCurrentProfile } from "@/lib/supabase/profile";\nimport { hasPermission } from "@/lib/auth/permissions";\n',
)
replace_once(
    path,
    '''  const [errorMessage, setErrorMessage] = useState<\n    string | null\n  >(null);\n''',
    '''  const [errorMessage, setErrorMessage] = useState<\n    string | null\n  >(null);\n  const [canManage, setCanManage] = useState(false);\n''',
)
replace_once(
    path,
    '''  useEffect(() => {\n    loadLocations();\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [zoneId, warehouseId]);\n''',
    '''  useEffect(() => {\n    let mounted = true;\n\n    void getCurrentProfile().then(({ profile }) => {\n      if (mounted) {\n        setCanManage(\n          profile ? hasPermission(profile.role, "warehouse.manage") : false\n        );\n      }\n    });\n\n    return () => {\n      mounted = false;\n    };\n  }, []);\n\n  useEffect(() => {\n    loadLocations();\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [zoneId, warehouseId]);\n''',
)
replace_once(
    path,
    '''  function openLocationEdit(locationId: string) {\n    router.push(\n      `/locations/${locationId}/edit`\n    );\n  }\n''',
    '''  function openLocationEdit(locationId: string) {\n    if (!canManage) return;\n    router.push(\n      `/locations/${locationId}/edit`\n    );\n  }\n''',
)
replace_once(
    path,
    '''  async function handleToggleStatus(\n    location: LocationRow\n  ) {\n    setActionLoadingId(location.id);\n''',
    '''  async function handleToggleStatus(\n    location: LocationRow\n  ) {\n    if (!canManage) return;\n    setActionLoadingId(location.id);\n''',
)
replace_once(
    path,
    '''  async function handleDeleteLocation(\n    location: LocationRow\n  ) {\n    setErrorMessage(null);\n''',
    '''  async function handleDeleteLocation(\n    location: LocationRow\n  ) {\n    if (!canManage) return;\n    setErrorMessage(null);\n''',
)
replace_once(
    path,
    '''          <Link\n            href={addLocationHref}\n            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"\n          >\n            Add Location\n          </Link>''',
    '''          {canManage && (\n            <Link\n              href={addLocationHref}\n              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"\n            >\n              Add Location\n            </Link>\n          )}''',
)
replace_once(
    path,
    '''                    onDoubleClick={() =>\n                      openLocationEdit(location.id)\n                    }\n                    title="Double click to edit"\n                    className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"''',
    '''                    onDoubleClick={canManage ? () =>\n                      openLocationEdit(location.id)\n                    : undefined}\n                    title={canManage ? "Double click to edit" : undefined}\n                    className={`${canManage ? "cursor-pointer " : ""}transition hover:bg-gray-50 dark:hover:bg-white/[0.03]`}''',
)
replace_once(
    path,
    '''                        <Link\n                          href={`/locations/${location.id}/edit`}\n                          onClick={(event) =>\n                            event.stopPropagation()\n                          }\n                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"\n                        >\n                          Edit\n                        </Link>''',
    '''                        {canManage && (\n                          <Link\n                            href={`/locations/${location.id}/edit`}\n                            onClick={(event) =>\n                              event.stopPropagation()\n                            }\n                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"\n                          >\n                            Edit\n                          </Link>\n                        )}''',
)
replace_once(
    path,
    '''                        <button\n                          type="button"\n                          onClick={(event) => {\n                            event.stopPropagation();\n\n                            handleToggleStatus(\n                              location\n                            );\n                          }}\n                          disabled={isActionLoading}\n                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${location.is_active\n                            ? "bg-warning-50 text-warning-700 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400"\n                            : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"\n                            }`}\n                        >\n                          {location.is_active\n                            ? "Deactivate"\n                            : "Activate"}\n                        </button>''',
    '''                        {canManage && (\n                          <button\n                            type="button"\n                            onClick={(event) => {\n                              event.stopPropagation();\n\n                              handleToggleStatus(\n                                location\n                              );\n                            }}\n                            disabled={isActionLoading}\n                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${location.is_active\n                              ? "bg-warning-50 text-warning-700 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400"\n                              : "bg-success-50 text-success-700 hover:bg-success-100 dark:bg-success-500/10 dark:text-success-400"\n                              }`}\n                          >\n                            {location.is_active\n                              ? "Deactivate"\n                              : "Activate"}\n                          </button>\n                        )}''',
)
replace_once(
    path,
    '''                        <button\n                          type="button"\n                          onClick={(event) => {\n                            event.stopPropagation();\n\n                            handleDeleteLocation(\n                              location\n                            );\n                          }}\n                          disabled={isActionLoading}\n                          className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-medium text-error-600 transition hover:bg-error-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400 dark:hover:bg-error-500/20"\n                        >\n                          Delete\n                        </button>''',
    '''                        {canManage && (\n                          <button\n                            type="button"\n                            onClick={(event) => {\n                              event.stopPropagation();\n\n                              handleDeleteLocation(\n                                location\n                              );\n                            }}\n                            disabled={isActionLoading}\n                            className="rounded-lg bg-error-50 px-3 py-1.5 text-xs font-medium text-error-600 transition hover:bg-error-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-error-500/10 dark:text-error-400 dark:hover:bg-error-500/20"\n                          >\n                            Delete\n                          </button>\n                        )}''',
)

print("warehouse mutation guards applied")
