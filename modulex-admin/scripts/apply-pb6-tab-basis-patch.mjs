import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const file = (relative) => path.join(root, relative);
const read = (relative) => fs.readFileSync(file(relative), "utf8");
const write = (relative, value) => fs.writeFileSync(file(relative), value);

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
}

// Project workspace: move PB-6 inside the existing tab system and hide the tab outside Finance/Admin/Super Admin.
{
  const relative = "modulex-admin/src/components/customers/ProjectDetailWorkspace.tsx";
  let source = read(relative);
  source = replaceOnce(
    source,
    'import ProjectPendingDomainTab from "@/components/customers/project-detail/ProjectPendingDomainTab";\n',
    'import ProjectPendingDomainTab from "@/components/customers/project-detail/ProjectPendingDomainTab";\nimport ProjectParticipantRoleManager from "@/components/customers/project-detail/ProjectParticipantRoleManager";\nimport ProjectParticipantsCommissionPanel from "@/components/customers/project-detail/ProjectParticipantsCommissionPanel";\n',
    "workspace imports",
  );
  source = replaceOnce(
    source,
    'const PROJECT_TABS = ["Overview", "Orders", "Finance", "Procurement", "Fulfillment", "Documents", "Activity"] as const;',
    'const PROJECT_TABS = ["Overview", "Orders", "Finance", "Participants & Commission", "Procurement", "Fulfillment", "Documents", "Activity"] as const;',
    "workspace tabs",
  );
  source = replaceOnce(
    source,
    '  const [canManageProcurementInvoices, setCanManageProcurementInvoices] = useState(false);\n',
    '  const [canManageProcurementInvoices, setCanManageProcurementInvoices] = useState(false);\n  const [canViewParticipantsCommission, setCanViewParticipantsCommission] = useState(false);\n',
    "workspace PB-6 access state",
  );
  source = replaceOnce(
    source,
    '  const load = useCallback(async () => {',
    '  const visibleProjectTabs = useMemo(\n    () => PROJECT_TABS.filter((tab) => tab !== "Participants & Commission" || canViewParticipantsCommission),\n    [canViewParticipantsCommission],\n  );\n\n  const load = useCallback(async () => {',
    "workspace visible tabs",
  );
  source = replaceOnce(
    source,
    '      let nextProfiles: ProfileOption[] = [];\n',
    '      const nextCanViewParticipantsCommission = Boolean(\n        profile && profile.roles.some((role) => ["super_admin", "admin", "finance"].includes(role)),\n      );\n      let nextProfiles: ProfileOption[] = [];\n',
    "workspace role boundary",
  );
  source = replaceOnce(
    source,
    '      setCanManageProcurementInvoices(nextCanManageProcurementInvoices);\n',
    '      setCanManageProcurementInvoices(nextCanManageProcurementInvoices);\n      setCanViewParticipantsCommission(nextCanViewParticipantsCommission);\n',
    "workspace set PB-6 access",
  );
  source = replaceOnce(
    source,
    '  useEffect(() => {\n    const requestedTab = searchParams.get("tab");\n    if (requestedTab && PROJECT_TABS.includes(requestedTab as ProjectTab)) {\n      setActiveTab(requestedTab as ProjectTab);\n    }\n  }, [searchParams]);',
    '  useEffect(() => {\n    const requestedTab = searchParams.get("tab");\n    if (!requestedTab || !PROJECT_TABS.includes(requestedTab as ProjectTab)) return;\n    if (requestedTab === "Participants & Commission" && !canViewParticipantsCommission) {\n      setActiveTab("Overview");\n      return;\n    }\n    setActiveTab(requestedTab as ProjectTab);\n  }, [canViewParticipantsCommission, searchParams]);',
    "workspace deep-link guard",
  );
  source = replaceOnce(source, "          {PROJECT_TABS.map((tab) => (", "          {visibleProjectTabs.map((tab) => (", "workspace tab map");
  source = replaceOnce(
    source,
    '      {activeTab === "Procurement" ? (\n',
    '      {activeTab === "Participants & Commission" && canViewParticipantsCommission ? (\n        <div className="space-y-6">\n          <ProjectParticipantsCommissionPanel projectId={project.id} />\n          <ProjectParticipantRoleManager />\n        </div>\n      ) : null}\n\n      {activeTab === "Procurement" ? (\n',
    "workspace PB-6 render",
  );
  write(relative, source);
}

// Project page: PB-6 is no longer rendered below the workspace.
{
  const relative = "modulex-admin/src/app/(admin)/projects/[id]/page.tsx";
  let source = read(relative);
  source = source.replace('import ProjectParticipantRoleManager from "@/components/customers/project-detail/ProjectParticipantRoleManager";\n', "");
  source = source.replace('import ProjectParticipantsCommissionPanel from "@/components/customers/project-detail/ProjectParticipantsCommissionPanel";\n', "");
  source = source.replace('      <ProjectParticipantsCommissionPanel projectId={id} />\n      <ProjectParticipantRoleManager />\n', "");
  write(relative, source);
}

// Client domain: internal PB-6 detail has one role boundary; percentage basis comes from DB preview and creation ignores manual basis.
{
  const relative = "modulex-admin/src/lib/customers/project-participants-commission-domain.ts";
  let source = read(relative);
  source = replaceOnce(
    source,
    'import { getCurrentProfile, type Profile } from "@/lib/supabase/profile";\n',
    'import { getCurrentProfile, type Profile } from "@/lib/supabase/profile";\n\nconst PB6_INTERNAL_ROLES = ["super_admin", "admin", "finance"] as const;\n',
    "domain internal role constant",
  );
  source = source.replace('hasAnyRole(profile, ["super_admin", "admin", "finance", "sales"])', 'hasAnyRole(profile, PB6_INTERNAL_ROLES)');
  source = replaceOnce(
    source,
    '  if (!hasAnyRole(profile, ["super_admin", "admin", "finance"])) {\n    throw new Error("You do not have permission to manage Project commissions.");\n  }',
    '  if (!hasAnyRole(profile, PB6_INTERNAL_ROLES)) {\n    throw new Error("You do not have permission to manage Project commissions.");\n  }',
    "domain commission manage role boundary",
  );
  source = replaceOnce(
    source,
    'export async function getProjectParticipantAccess() {\n  const profile = await currentProfileOrThrow();\n  return {\n    canViewParticipants: hasAnyRole(profile, ["super_admin", "admin", "finance", "sales"]),\n    canManageParticipants: hasAnyRole(profile, ["super_admin", "admin"]),\n    canViewCommissions: hasAnyRole(profile, ["super_admin", "admin", "finance", "sales"]),\n    canManageCommissions: hasAnyRole(profile, ["super_admin", "admin", "finance"]),\n    isSalesOnly: hasAnyRole(profile, ["sales"]) && !hasAnyRole(profile, ["super_admin", "admin", "finance"]),\n  };\n}',
    'export async function getProjectParticipantAccess() {\n  const profile = await currentProfileOrThrow();\n  const canViewInternal = hasAnyRole(profile, PB6_INTERNAL_ROLES);\n  return {\n    canViewParticipants: canViewInternal,\n    canManageParticipants: hasAnyRole(profile, ["super_admin", "admin"]),\n    canViewCommissions: canViewInternal,\n    canManageCommissions: canViewInternal,\n  };\n}',
    "domain access result",
  );
  source = replaceOnce(
    source,
    'export async function createCustomerProjectCommissionObligation(input: {',
    'export async function getCustomerProjectCommissionBasisPreview(input: {\n  projectId: string;\n  scopeType: ProjectCommissionScopeType;\n  currencyCode: string;\n  productCategoryId?: string | null;\n  productId?: string | null;\n}) {\n  await requireCommissionManage();\n  const currencyCode = normalizeCurrency(input.currencyCode);\n  const { data, error } = await supabase.rpc("get_customer_project_commission_basis_preview", {\n    p_project_id: input.projectId,\n    p_scope_type: input.scopeType,\n    p_currency_code: currencyCode,\n    p_product_category_id: input.scopeType === "category" ? input.productCategoryId || null : null,\n    p_product_id: input.scopeType === "product" ? input.productId || null : null,\n  });\n  if (error) throw error;\n  const basis = Number(data);\n  if (!Number.isFinite(basis) || basis <= 0) throw new Error("Commission basis is unavailable for this Project scope.");\n  return basis;\n}\n\nexport async function createCustomerProjectCommissionObligation(input: {',
    "domain basis preview",
  );
  source = replaceOnce(
    source,
    '  } else {\n    if (!Number.isFinite(input.basisAmount) || Number(input.basisAmount) < 0) throw new Error("Commission basis amount cannot be negative.");\n    if (!Number.isFinite(input.rate) || Number(input.rate) <= 0 || Number(input.rate) > 100) throw new Error("Commission percentage must be greater than zero and at most 100.");\n  }',
    '  } else {\n    if (!Number.isFinite(input.rate) || Number(input.rate) <= 0 || Number(input.rate) > 100) throw new Error("Commission percentage must be greater than zero and at most 100.");\n  }',
    "domain percentage validation",
  );
  source = replaceOnce(
    source,
    '    p_basis_amount: input.basisType === "percentage" ? Number(input.basisAmount) : null,',
    '    p_basis_amount: null,',
    "domain percentage basis payload",
  );
  write(relative, source);
}

// Panel: remove free-form basis entry, display authoritative preview and estimated commission.
{
  const relative = "modulex-admin/src/components/customers/project-detail/ProjectParticipantsCommissionPanel.tsx";
  let source = read(relative);
  source = replaceOnce(
    source,
    '  getCustomerProjectCommissions,\n',
    '  getCustomerProjectCommissions,\n  getCustomerProjectCommissionBasisPreview,\n',
    "panel preview import",
  );
  source = source.replace('  const [isSalesOnly, setIsSalesOnly] = useState(false);\n', "");
  source = source.replace('  const [commissionBasisAmount, setCommissionBasisAmount] = useState("");\n', '  const [commissionBasisPreview, setCommissionBasisPreview] = useState<number | null>(null);\n  const [commissionBasisPreviewError, setCommissionBasisPreviewError] = useState<string | null>(null);\n  const [loadingCommissionBasis, setLoadingCommissionBasis] = useState(false);\n');
  source = source.replace('      setIsSalesOnly(access.isSalesOnly);\n', "");
  source = replaceOnce(
    source,
    '  useEffect(() => {\n    setReversalEventId("");\n    void loadEvents();\n  }, [loadEvents]);\n',
    '  useEffect(() => {\n    setReversalEventId("");\n    void loadEvents();\n  }, [loadEvents]);\n\n  useEffect(() => {\n    let active = true;\n    if (commissionBasisType !== "percentage") {\n      setCommissionBasisPreview(null);\n      setCommissionBasisPreviewError(null);\n      setLoadingCommissionBasis(false);\n      return () => { active = false; };\n    }\n    if (commissionScopeType !== "project" && !commissionScopeId) {\n      setCommissionBasisPreview(null);\n      setCommissionBasisPreviewError(null);\n      setLoadingCommissionBasis(false);\n      return () => { active = false; };\n    }\n    if (!/^[A-Z]{3}$/.test(commissionCurrency.trim().toUpperCase())) {\n      setCommissionBasisPreview(null);\n      setCommissionBasisPreviewError("Enter a valid three-letter currency code.");\n      setLoadingCommissionBasis(false);\n      return () => { active = false; };\n    }\n\n    setLoadingCommissionBasis(true);\n    setCommissionBasisPreviewError(null);\n    void getCustomerProjectCommissionBasisPreview({\n      projectId,\n      scopeType: commissionScopeType,\n      currencyCode: commissionCurrency,\n      productCategoryId: commissionScopeType === "category" ? commissionScopeId || null : null,\n      productId: commissionScopeType === "product" ? commissionScopeId || null : null,\n    }).then((basis) => {\n      if (active) setCommissionBasisPreview(basis);\n    }).catch((previewError) => {\n      if (!active) return;\n      setCommissionBasisPreview(null);\n      setCommissionBasisPreviewError(previewError instanceof Error ? previewError.message : "Commission basis could not be calculated.");\n    }).finally(() => {\n      if (active) setLoadingCommissionBasis(false);\n    });\n\n    return () => { active = false; };\n  }, [commissionBasisType, commissionCurrency, commissionScopeId, commissionScopeType, projectId]);\n',
    "panel basis preview effect",
  );
  source = source.replace('        basisAmount: commissionBasisType === "percentage" ? Number(commissionBasisAmount) : null,\n', "");
  source = source.replace('      setCommissionBasisAmount("");\n', "");
  source = source.replace(/      \{isSalesOnly \? \([\s\S]*?      \) : null\}\n\n/, "");
  source = source.replace('{isSalesOnly ? "No commission obligation is visible for your Project participation." : "No commission obligations have been created."}', '"No commission obligations have been created."');
  source = replaceOnce(
    source,
    '              ) : (\n                <>\n                  <div>\n                    <Label htmlFor="pb6-commission-basis-amount">Basis amount snapshot</Label>\n                    <Input id="pb6-commission-basis-amount" type="number" min="0" step="0.01" value={commissionBasisAmount} onChange={(event) => setCommissionBasisAmount(event.target.value)} />\n                  </div>\n                  <div>\n                    <Label htmlFor="pb6-commission-rate">Rate %</Label>\n                    <Input id="pb6-commission-rate" type="number" min="0" max="100" step="0.01" value={commissionRate} onChange={(event) => setCommissionRate(event.target.value)} />\n                  </div>\n                </>\n              )}',
    '              ) : (\n                <>\n                  <div className={`${ADMIN_SURFACE_CARD} p-3`}>\n                    <p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Commission basis</p>\n                    <p className="font-medium">{loadingCommissionBasis ? "Calculating…" : commissionBasisPreview !== null ? money(commissionBasisPreview, commissionCurrency) : "Unavailable"}</p>\n                    {commissionBasisPreviewError ? <p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>{commissionBasisPreviewError}</p> : null}\n                  </div>\n                  <div>\n                    <Label htmlFor="pb6-commission-rate">Rate %</Label>\n                    <Input id="pb6-commission-rate" type="number" min="0" max="100" step="0.01" value={commissionRate} onChange={(event) => setCommissionRate(event.target.value)} />\n                  </div>\n                  <div className={`${ADMIN_SURFACE_CARD} p-3`}>\n                    <p className={`text-xs ${ADMIN_TEXT_STYLES.muted}`}>Estimated commission</p>\n                    <p className="font-medium">{commissionBasisPreview !== null && Number(commissionRate) > 0 ? money((commissionBasisPreview * Number(commissionRate)) / 100, commissionCurrency) : "—"}</p>\n                  </div>\n                </>\n              )}',
    "panel percentage fields",
  );
  source = replaceOnce(
    source,
    '                <Button disabled={saving || !commissionParticipantId || (commissionScopeType !== "project" && !commissionScopeId)} onClick={() => void createCommission()}>{saving ? "Saving…" : "Create Pending Commission"}</Button>',
    '                <Button disabled={saving || !commissionParticipantId || (commissionScopeType !== "project" && !commissionScopeId) || (commissionBasisType === "percentage" && (loadingCommissionBasis || commissionBasisPreview === null))} onClick={() => void createCommission()}>{saving ? "Saving…" : "Create Pending Commission"}</Button>',
    "panel create guard",
  );
  write(relative, source);
}

// Historical PB-6 contract: final integration is now inside the Project workspace, not directly on the page.
{
  const relative = "modulex-admin/scripts/project-pb6-participants-commission-contract.mjs";
  let source = read(relative);
  source = replaceOnce(
    source,
    'assert.match(page, /ProjectParticipantsCommissionPanel[\\s\\S]*ProjectParticipantRoleManager/i, "Project detail must render PB-6 participant/commission and role-management surfaces");',
    'assert.doesNotMatch(page, /ProjectParticipantsCommissionPanel|ProjectParticipantRoleManager/i, "Project page must delegate PB-6 rendering to the tab workspace");',
    "historical PB-6 page contract",
  );
  write(relative, source);
}

// Acceptance record: Sales no longer receives internal PB-6 detail; personal final-result projection is explicitly deferred.
{
  const relative = "docs/acceptance/pb-6-project-participants-commission.md";
  let source = read(relative);
  source = source.replace('| Sales | read | own obligations only | own history only | restricted | none |', '| Sales | no internal PB-6 surface | none | none | none | none |');
  source = source.replace('Sales own-commission visibility resolves through canonical participant identity: `profile_id = auth.uid()` or `hr_employees.user_id = auth.uid()`. Historical own obligations remain visible after participation ends.\n', 'Sales does not receive the internal Participants & Commission ledger. A later personal, summary-only projection may expose only the individual final receivable after Project completion; that projection is intentionally separate from the internal ledger.\n');
  source = source.replace('Project Detail renders `ProjectParticipantsCommissionPanel` plus Admin-only `ProjectParticipantRoleManager` using shared Modulex Admin primitives and appearance tokens.\n', 'Project Detail exposes a `Participants & Commission` tab using shared Modulex Admin primitives and appearance tokens. The tab is visible only to Finance, Admin, and Super Admin; participant-role configuration remains Admin/Super Admin-only inside that tab.\n');
  source = source.replace('- Sales own-commission privacy notice;\n- Finance payout state without exposing payout detail to Sales.\n', '- Finance payout state within the internal tab;\n- no Sales access to participant assignments, commission basis, event history, or payout detail.\n');
  write(relative, source);
}

console.log("PB-6 tab/access/percentage patch applied");
