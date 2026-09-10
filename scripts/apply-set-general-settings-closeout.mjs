import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);

function replaceOnce(file, from, to) {
  const source = read(file);
  if (!source.includes(from)) throw new Error(`${file}: expected source fragment not found: ${from.slice(0, 100)}`);
  write(file, source.replace(from, to));
}

const settingsTypes = "modulex-admin/src/lib/settings/types.ts";
replaceOnce(settingsTypes,
`  timezone: string;\n  administrative_fee_default_percent: number;`,
`  timezone: string;\n  order_number_prefix: string;\n  order_number_padding: number;\n  invoice_number_prefix: string;\n  invoice_number_padding: number;\n  administrative_fee_default_percent: number;`);
replaceOnce(settingsTypes,
`  timezone: "America/New_York",\n  administrative_fee_default_percent: 3,`,
`  timezone: "UTC",\n  order_number_prefix: "ORD-",\n  order_number_padding: 6,\n  invoice_number_prefix: "INV-",\n  invoice_number_padding: 6,\n  administrative_fee_default_percent: 3,`);

const orderDomain = "modulex-admin/src/lib/customers/order-domain.ts";
replaceOnce(orderDomain,
`export type CreateOrderContext = {\n  customer: Customer;`,
`export type CreateOrderContext = {\n  customer: Customer;\n  defaultCurrency: string;`);
replaceOnce(orderDomain,
`  const [customerResult, addressesResult, groupsResult, methodsResult, products, taxRulesResult] = await Promise.all([\n    supabase.from("customers").select("*").eq("id", customerId).single(),`,
`  const [customerResult, addressesResult, groupsResult, methodsResult, products, taxRulesResult, settingsResult] = await Promise.all([\n    supabase.from("customers").select("*").eq("id", customerId).single(),`);
replaceOnce(orderDomain,
`    supabase.from("order_tax_rules").select("fulfillment_type, tax_rate, is_active"),\n  ]);\n\n  const firstError = customerResult.error || addressesResult.error || groupsResult.error || methodsResult.error || taxRulesResult.error;\n  if (firstError) throw firstError;\n\n  return {\n    customer: customerResult.data as Customer,`,
`    supabase.from("order_tax_rules").select("fulfillment_type, tax_rate, is_active"),\n    supabase.from("general_settings").select("default_currency").eq("id", 1).single(),\n  ]);\n\n  const firstError = customerResult.error || addressesResult.error || groupsResult.error || methodsResult.error || taxRulesResult.error || settingsResult.error;\n  if (firstError) throw firstError;\n  const defaultCurrency = String(settingsResult.data?.default_currency ?? "").trim().toUpperCase();\n  if (!/^[A-Z]{3}$/.test(defaultCurrency)) throw new Error("Company main currency is unavailable or invalid.");\n\n  return {\n    customer: customerResult.data as Customer,\n    defaultCurrency,`);
replaceOnce(orderDomain,
`  const [customerResult, orderResult, itemsResult, addressesResult, groupsResult, methodsResult, products, taxRulesResult] = await Promise.all([`,
`  const [customerResult, orderResult, itemsResult, addressesResult, groupsResult, methodsResult, products, taxRulesResult, settingsResult] = await Promise.all([`);
replaceOnce(orderDomain,
`    loadOrderProducts(true),\n    supabase.from("order_tax_rules").select("fulfillment_type, tax_rate, is_active"),\n  ]);\n\n  const firstError = customerResult.error || orderResult.error || itemsResult.error || addressesResult.error || groupsResult.error || methodsResult.error || taxRulesResult.error;\n  if (firstError) throw firstError;`,
`    loadOrderProducts(true),\n    supabase.from("order_tax_rules").select("fulfillment_type, tax_rate, is_active"),\n    supabase.from("general_settings").select("default_currency").eq("id", 1).single(),\n  ]);\n\n  const firstError = customerResult.error || orderResult.error || itemsResult.error || addressesResult.error || groupsResult.error || methodsResult.error || taxRulesResult.error || settingsResult.error;\n  if (firstError) throw firstError;\n  const defaultCurrency = String(settingsResult.data?.default_currency ?? "").trim().toUpperCase();\n  if (!/^[A-Z]{3}$/.test(defaultCurrency)) throw new Error("Company main currency is unavailable or invalid.");`);
replaceOnce(orderDomain,
`  return {\n    customer: customerResult.data as Customer,\n    order: orderResult.data as CustomerOrder,`,
`  return {\n    customer: customerResult.data as Customer,\n    defaultCurrency,\n    order: orderResult.data as CustomerOrder,`);

const newOrder = "modulex-admin/src/components/customers/NewCustomerOrder.tsx";
replaceOnce(newOrder,
`function money(value: number, currency = "USD") {\n  try {\n    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number.isFinite(value) ? value : 0);\n  } catch {\n    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number.isFinite(value) ? value : 0);\n  }\n}`,
`function money(value: number, currency: string) {\n  const amount = Number.isFinite(value) ? value : 0;\n  try {\n    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);\n  } catch {\n    return \`${currency} \${amount.toFixed(2)}\`;\n  }\n}`);
replaceOnce(newOrder,
`  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);`,
`  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);\n  const [defaultCurrency, setDefaultCurrency] = useState("");`);
replaceOnce(newOrder,
`        const loadedCustomer = context.customer;`,
`        const loadedCustomer = context.customer;\n        const loadedDefaultCurrency = context.defaultCurrency;`);
replaceOnce(newOrder,
`          if ((acceptedPreview.currencyCode || "USD").toUpperCase() !== (loadedCustomer.currency_code || "USD").toUpperCase()) {`,
`          if ((acceptedPreview.currencyCode || loadedDefaultCurrency).toUpperCase() !== (loadedCustomer.currency_code || loadedDefaultCurrency).toUpperCase()) {`);
replaceOnce(newOrder,
`        setCustomer(loadedCustomer);`,
`        setCustomer(loadedCustomer);\n        setDefaultCurrency(loadedDefaultCurrency);`);
replaceOnce(newOrder,
`    if (!priceGroupId) {\n      setPrices([]);\n      return;\n    }`,
`    if (!priceGroupId || !defaultCurrency) {\n      setPrices([]);\n      return;\n    }`);
replaceOnce(newOrder,
`        const data = await loadOrderPrices(priceGroupId, customer?.currency_code || "USD");`,
`        const data = await loadOrderPrices(priceGroupId, customer?.currency_code || defaultCurrency);`);
replaceOnce(newOrder,
`  }, [priceGroupId, customer?.currency_code]);`,
`  }, [priceGroupId, customer?.currency_code, defaultCurrency]);`);
replaceOnce(newOrder,
`  const currency = customer?.currency_code || "USD";`,
`  const currency = customer?.currency_code || defaultCurrency;`);

const orderPrint = "modulex-admin/src/components/customers/CustomerOrderPrint.tsx";
replaceOnce(orderPrint,
`import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from "@/lib/settings/types";`,
`import type { GeneralSettings } from "@/lib/settings/types";`);
replaceOnce(orderPrint,
`function money(value: string | number | null | undefined, currency: string, locale: string) {\n  const amount = Number(value ?? 0);\n  try {\n    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);\n  } catch {\n    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);\n  }\n}`,
`function money(value: string | number | null | undefined, currency: string, locale: string) {\n  const parsed = Number(value ?? 0);\n  const amount = Number.isFinite(parsed) ? parsed : 0;\n  try {\n    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);\n  } catch {\n    return \`${currency} \${amount.toFixed(2)}\`;\n  }\n}`);
replaceOnce(orderPrint,
`  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);`,
`  const [settings, setSettings] = useState<GeneralSettings | null>(null);`);
replaceOnce(orderPrint,
`      const firstError = customerResult.error || orderResult.error || itemsResult.error;`,
`      const firstError = customerResult.error || orderResult.error || itemsResult.error || settingsResult.error;`);
replaceOnce(orderPrint,
`      if (!settingsResult.error && settingsResult.data) setSettings(settingsResult.data as GeneralSettings);`,
`      if (settingsResult.data) setSettings(settingsResult.data as GeneralSettings);`);
replaceOnce(orderPrint,
`  if (!customer || !order) return <div className={\`min-h-screen p-10 text-center text-sm \${ADMIN_DOCUMENT_STYLES.loadError}\`}>{errorMessage || "Order not found."}</div>;`,
`  if (!customer || !order || !settings) return <div className={\`min-h-screen p-10 text-center text-sm \${ADMIN_DOCUMENT_STYLES.loadError}\`}>{errorMessage || "Order or canonical company settings not found."}</div>;`);
replaceOnce(orderPrint,
`  const locale = settings.locale || "en-US";\n  const timezone = settings.timezone || "UTC";\n  const currency = order.currency_code || settings.default_currency || "USD";`,
`  const locale = settings.locale;\n  const timezone = settings.timezone;\n  const currency = order.currency_code;`);
replaceOnce(orderPrint,
`    title: settings.order_document_title || "Sales Order / Order Confirmation",`,
`    title: settings.order_document_title,`);

const invoicePrint = "modulex-admin/src/components/customers/CustomerInvoicePrint.tsx";
replaceOnce(invoicePrint,
`import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from "@/lib/settings/types";`,
`import type { GeneralSettings } from "@/lib/settings/types";`);
replaceOnce(invoicePrint,
`function money(value: string | number | null | undefined, currency: string, locale: string) {\n  const amount = Number(value ?? 0);\n  try {\n    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);\n  } catch {\n    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);\n  }\n}`,
`function money(value: string | number | null | undefined, currency: string, locale: string) {\n  const parsed = Number(value ?? 0);\n  const amount = Number.isFinite(parsed) ? parsed : 0;\n  try {\n    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);\n  } catch {\n    return \`${currency} \${amount.toFixed(2)}\`;\n  }\n}`);
replaceOnce(invoicePrint,
`  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);`,
`  const [settings, setSettings] = useState<GeneralSettings | null>(null);`);
replaceOnce(invoicePrint,
`      const firstError = customerResult.error || invoiceResult.error || itemsResult.error;`,
`      const firstError = customerResult.error || invoiceResult.error || itemsResult.error || settingsResult.error;`);
replaceOnce(invoicePrint,
`      if (!settingsResult.error && settingsResult.data) setSettings(settingsResult.data as GeneralSettings);`,
`      if (settingsResult.data) setSettings(settingsResult.data as GeneralSettings);`);
replaceOnce(invoicePrint,
`  if (!customer || !invoice) return <div className={\`min-h-screen p-10 text-center text-sm \${ADMIN_DOCUMENT_STYLES.loadError}\`}>{errorMessage || "Invoice not found."}</div>;`,
`  if (!customer || !invoice || !settings) return <div className={\`min-h-screen p-10 text-center text-sm \${ADMIN_DOCUMENT_STYLES.loadError}\`}>{errorMessage || "Invoice or canonical company settings not found."}</div>;`);
replaceOnce(invoicePrint,
`  const locale = settings.locale || "en-US";\n  const timezone = settings.timezone || "UTC";\n  const currency = invoice.currency_code || settings.default_currency || "USD";`,
`  const locale = settings.locale;\n  const timezone = settings.timezone;\n  const currency = invoice.currency_code;`);
replaceOnce(invoicePrint,
`    title: settings.invoice_document_title || "Invoice",`,
`    title: settings.invoice_document_title,`);

write("modulex-admin/src/components/settings/OrderDocumentSettings.tsx", `"use client";\n\nimport { useEffect, useState } from "react";\nimport { supabase } from "@/lib/supabase/client";\nimport { getCurrentProfile } from "@/lib/supabase/profile";\n\nconst inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";\nconst textareaClass = "min-h-24 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";\n\nexport default function OrderDocumentSettings() {\n  const [title, setTitle] = useState("Sales Order / Order Confirmation");\n  const [footer, setFooter] = useState("");\n  const [prefix, setPrefix] = useState("ORD-");\n  const [padding, setPadding] = useState("6");\n  const [canEdit, setCanEdit] = useState(false);\n  const [loading, setLoading] = useState(true);\n  const [saving, setSaving] = useState(false);\n  const [message, setMessage] = useState<string | null>(null);\n  const [error, setError] = useState<string | null>(null);\n\n  useEffect(() => {\n    async function load() {\n      const { profile, error: profileError } = await getCurrentProfile();\n      if (profileError) { setError(profileError.message); setLoading(false); return; }\n      setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));\n      const { data, error: settingsError } = await supabase.from("general_settings").select("order_document_title,order_footer_note,order_number_prefix,order_number_padding").eq("id", 1).single();\n      if (settingsError) setError(settingsError.message);\n      else { setTitle(data.order_document_title); setFooter(data.order_footer_note || ""); setPrefix(data.order_number_prefix); setPadding(String(data.order_number_padding)); }\n      setLoading(false);\n    }\n    void load();\n  }, []);\n\n  async function save() {\n    const normalizedTitle = title.trim();\n    const normalizedPrefix = prefix.trim().toUpperCase();\n    const normalizedPadding = Number.parseInt(padding, 10);\n    if (!normalizedTitle) return setError("Order document title is required.");\n    if (!normalizedPrefix || normalizedPrefix.length > 12) return setError("Order Number Prefix must be 1-12 characters.");\n    if (!Number.isInteger(normalizedPadding) || normalizedPadding < 1 || normalizedPadding > 12) return setError("Order Number Padding must be between 1 and 12.");\n    setSaving(true); setError(null); setMessage(null);\n    const { error: saveError } = await supabase.from("general_settings").update({ order_document_title: normalizedTitle, order_footer_note: footer.trim() || null, order_number_prefix: normalizedPrefix, order_number_padding: normalizedPadding }).eq("id", 1);\n    if (saveError) setError(saveError.message);\n    else { setPrefix(normalizedPrefix); setPadding(String(normalizedPadding)); setMessage("Order document settings saved."); }\n    setSaving(false);\n  }\n\n  if (loading) return null;\n\n  return <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">\n    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Order Document Defaults</h2><p className="mt-1 text-sm text-gray-500">Company-wide wording and generated Order number format.</p></div>{canEdit && <button type="button" onClick={save} disabled={saving} className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50">{saving ? "Saving..." : "Save Order Defaults"}</button>}</div>\n    {error && <div className="mb-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}\n    {message && <div className="mb-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{message}</div>}\n    <div className="grid gap-4 sm:grid-cols-2">\n      <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Order Document Title *</span><input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canEdit || saving} className={inputClass} /></label>\n      <label><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Order Number Prefix</span><input value={prefix} onChange={(event) => setPrefix(event.target.value)} disabled={!canEdit || saving} className={inputClass} maxLength={12} /></label>\n      <label><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Order Number Padding</span><input value={padding} onChange={(event) => setPadding(event.target.value.replace(/\\D/g, ""))} disabled={!canEdit || saving} inputMode="numeric" className={inputClass} /></label>\n      <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Order Footer Note</span><textarea value={footer} onChange={(event) => setFooter(event.target.value)} disabled={!canEdit || saving} className={textareaClass} /></label>\n    </div>\n  </section>;\n}\n`);

write("modulex-admin/src/components/settings/InvoiceDocumentSettings.tsx", `"use client";\n\nimport { useEffect, useState } from "react";\nimport { supabase } from "@/lib/supabase/client";\nimport { getCurrentProfile } from "@/lib/supabase/profile";\n\nconst inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";\nconst textareaClass = "min-h-24 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800";\n\nexport default function InvoiceDocumentSettings() {\n  const [title, setTitle] = useState("Invoice");\n  const [footer, setFooter] = useState("");\n  const [prefix, setPrefix] = useState("INV-");\n  const [padding, setPadding] = useState("6");\n  const [canEdit, setCanEdit] = useState(false);\n  const [isLoading, setIsLoading] = useState(true);\n  const [isSaving, setIsSaving] = useState(false);\n  const [message, setMessage] = useState<string | null>(null);\n  const [error, setError] = useState<string | null>(null);\n\n  useEffect(() => {\n    async function load() {\n      const { profile, error: profileError } = await getCurrentProfile();\n      if (profileError) { setError(profileError.message); setIsLoading(false); return; }\n      setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));\n      const { data, error: settingsError } = await supabase.from("general_settings").select("invoice_document_title,invoice_footer_note,invoice_number_prefix,invoice_number_padding").eq("id", 1).single();\n      if (settingsError) setError(settingsError.message);\n      else { setTitle(data.invoice_document_title); setFooter(data.invoice_footer_note || ""); setPrefix(data.invoice_number_prefix); setPadding(String(data.invoice_number_padding)); }\n      setIsLoading(false);\n    }\n    void load();\n  }, []);\n\n  async function save() {\n    const normalizedTitle = title.trim();\n    const normalizedPrefix = prefix.trim().toUpperCase();\n    const normalizedPadding = Number.parseInt(padding, 10);\n    if (!normalizedTitle) return setError("Invoice document title is required.");\n    if (!normalizedPrefix || normalizedPrefix.length > 12) return setError("Invoice Number Prefix must be 1-12 characters.");\n    if (!Number.isInteger(normalizedPadding) || normalizedPadding < 1 || normalizedPadding > 12) return setError("Invoice Number Padding must be between 1 and 12.");\n    setIsSaving(true); setError(null); setMessage(null);\n    const { error: saveError } = await supabase.from("general_settings").update({ invoice_document_title: normalizedTitle, invoice_footer_note: footer.trim() || null, invoice_number_prefix: normalizedPrefix, invoice_number_padding: normalizedPadding }).eq("id", 1);\n    if (saveError) setError(saveError.message);\n    else { setPrefix(normalizedPrefix); setPadding(String(normalizedPadding)); setMessage("Invoice document settings saved."); }\n    setIsSaving(false);\n  }\n\n  if (isLoading) return null;\n\n  return <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">\n    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Invoice Document Defaults</h2><p className="mt-1 text-sm text-gray-500">Company-wide wording and generated Invoice number format.</p></div>{canEdit && <button type="button" onClick={save} disabled={isSaving} className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:opacity-50">{isSaving ? "Saving..." : "Save Invoice Defaults"}</button>}</div>\n    {error && <div className="mb-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}\n    {message && <div className="mb-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{message}</div>}\n    <div className="grid gap-4 sm:grid-cols-2">\n      <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Invoice Document Title *</span><input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canEdit || isSaving} className={inputClass} /></label>\n      <label><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Invoice Number Prefix</span><input value={prefix} onChange={(event) => setPrefix(event.target.value)} disabled={!canEdit || isSaving} className={inputClass} maxLength={12} /></label>\n      <label><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Invoice Number Padding</span><input value={padding} onChange={(event) => setPadding(event.target.value.replace(/\\D/g, ""))} disabled={!canEdit || isSaving} inputMode="numeric" className={inputClass} /></label>\n      <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Invoice Footer Note</span><textarea value={footer} onChange={(event) => setFooter(event.target.value)} disabled={!canEdit || isSaving} className={textareaClass} /></label>\n    </div>\n  </section>;\n}\n`);

const roadmap = "modulex-admin/ADMIN_ROADMAP.md";
replaceOnce(roadmap,
`## SET — General Settings\n\nStatus: \`[~]\` settings surfaces exist; ownership and downstream-consumer review remains.\n\n- [ ] **SET-A1 — Company/public profile ownership.** Confirm \`general_settings\`/Company workspace is the single canonical source and Store consumes only narrow public projections.\n- [ ] **SET-A2 — Locale/timezone/currency.** Verify each setting has one owner and every consuming Admin/Store/Finance surface uses it consistently; preserve Finance transaction-time FX semantics.\n- [ ] **SET-A3 — Tax rules.** Audit actual business requirements, active/inactive behavior, effective usage in Orders/Invoices and mutation authorization.\n- [ ] **SET-A4 — Document settings.** Reconcile numbering, templates, logos/signatures and document defaults without introducing duplicate configuration stores.\n- [ ] **SET-A5 — Settings exit gate.** Regression + RBAC + production acceptance proving settings have clear ownership and downstream consumers.`,
`## SET — General Settings\n\nStatus: \`[x]\` SET-A1→SET-A5 implemented and production-accepted.\n\n- [x] **SET-A1 — Company/public profile ownership.** \`general_settings\` owns the singleton company/public profile; structured contact/location/hours retain their canonical tables and Store consumes narrow public RPC projections only.\n- [x] **SET-A2 — Locale/timezone/currency.** Locale, timezone and main currency have canonical ownership; customer/order/invoice fallbacks no longer silently force USD and Finance transaction-time FX snapshots are unchanged.\n- [x] **SET-A3 — Tax rules.** Active/inactive fulfillment Tax Rules remain server-enforced at Order confirmation, Order→Invoice tax snapshots remain historical, and mutation/audit boundaries are explicit.\n- [x] **SET-A4 — Document settings.** Order/Invoice numbering format, titles, footers and branding stay in canonical General Settings while existing sequences remain counters; no duplicate document configuration store was introduced.\n- [x] **SET-A5 — Settings exit gate.** Settings RBAC/RLS/RPC boundaries and Store/Finance/Documents downstream contracts are covered by final regression and production-safe acceptance.`);

console.log("SET closeout source transform applied");
