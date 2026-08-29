import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());

function file(rel) {
  return path.join(repoRoot, rel);
}

function read(rel) {
  return fs.readFileSync(file(rel), "utf8");
}

function write(rel, content) {
  fs.mkdirSync(path.dirname(file(rel)), { recursive: true });
  fs.writeFileSync(file(rel), content);
}

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
}

function replaceRegex(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches) throw new Error(`${label}: pattern not found`);
  return source.replace(pattern, replacement);
}

const customerCardRel = "modulex-admin/src/components/customers/CustomerCard.tsx";
let card = read(customerCardRel);

card = replaceExact(card, "  CustomerPortalUser,\n", "", "remove legacy portal type import");
card = replaceExact(
  card,
  'const tabs = ["General", "Contacts", "Pricing", "Addresses", "Commercial", "Web / Portal", "Notes & Documents", "Activity"] as const;',
  'const tabs = ["General", "Contacts", "Pricing", "Addresses", "Commercial", "Notes & Documents", "Activity"] as const;',
  "remove legacy portal tab",
);
card = replaceExact(card, "  const [portalUsers, setPortalUsers] = useState<CustomerPortalUser[]>([]);\n", "", "remove legacy portal users state");
card = replaceExact(card, "  const [canManagePortal, setCanManagePortal] = useState(false);\n", "", "remove legacy portal permission state");
card = replaceExact(card, '  const [portalForm, setPortalForm] = useState({ full_name: "", login_email: "", portal_role: "buyer" as "admin" | "buyer" | "viewer", status: "never_invited" as "never_invited" | "invited" | "active" | "suspended", is_primary: false });\n', "", "remove legacy portal form");
card = replaceExact(
  card,
  "    const [customerResult, typesResult, groupsResult, profilesResult, termsResult, contactsResult, addressesResult, commercialResult, portalResult, notesResult, documentsResult, activityResult] = await Promise.all([",
  "    const [customerResult, typesResult, groupsResult, profilesResult, termsResult, contactsResult, addressesResult, commercialResult, notesResult, documentsResult, activityResult] = await Promise.all([",
  "remove portal result from loader",
);
card = replaceExact(card, '      supabase.from("customer_portal_users").select("*").eq("customer_id", customerId).order("is_primary", { ascending: false }).order("created_at"),\n', "", "remove legacy portal query");
card = replaceExact(
  card,
  "    const firstError = customerResult.error || typesResult.error || groupsResult.error || profilesResult.error || termsResult.error || contactsResult.error || addressesResult.error || commercialResult.error || portalResult.error || notesResult.error || documentsResult.error || activityResult.error;",
  "    const firstError = customerResult.error || typesResult.error || groupsResult.error || profilesResult.error || termsResult.error || contactsResult.error || addressesResult.error || commercialResult.error || notesResult.error || documentsResult.error || activityResult.error;",
  "remove portal loader error",
);
card = replaceExact(card, "    setPortalUsers((portalResult.data ?? []) as CustomerPortalUser[]);\n", "", "remove portal state load");
card = replaceExact(card, '      setCanManagePortal(["super_admin", "admin"].includes(profile?.role ?? ""));\n', "", "remove portal permission setup");

const saveCustomerCalls = (card.match(/\bsaveCustomer\s*\(/g) ?? []).length;
if (saveCustomerCalls !== 2) throw new Error(`saveCustomer safety check: expected 2 occurrences before removal, found ${saveCustomerCalls}`);
card = replaceRegex(
  card,
  /\n  async function saveCustomer\(fields: Partial<Customer>, activityTitle: string\) \{[\s\S]*?\n  \}\n\n  async function saveCustomerMaster/,
  "\n  async function saveCustomerMaster",
  "remove generic customer save used by portal toggle",
);

card = replaceRegex(
  card,
  /  async function addAddress\(\) \{[\s\S]*?\n  \}\n  async function removeAddress/,
  `  async function addAddress() {
    if (!addressForm.address_name.trim() || !addressForm.address_line_1.trim() || !addressForm.city.trim() || addressForm.country_code.trim().length !== 2) return setErrorMessage("Address name, address line, city and 2-letter country code are required.");
    clearMessages(); setIsSaving(true);
    const { error } = await supabase.rpc("create_customer_address", {
      p_customer_id: customerId,
      p_address_name: addressForm.address_name.trim(),
      p_company_name: addressForm.company_name.trim() || null,
      p_contact_name: addressForm.contact_name.trim() || null,
      p_address_line_1: addressForm.address_line_1.trim(),
      p_address_line_2: addressForm.address_line_2.trim() || null,
      p_postal_code: addressForm.postal_code.trim() || null,
      p_city: addressForm.city.trim(),
      p_state_region: addressForm.state_region.trim() || null,
      p_country_code: addressForm.country_code.trim().toUpperCase(),
      p_phone: addressForm.phone.trim() || null,
      p_address_type: addressForm.address_type,
      p_is_default_billing: addressForm.is_default_billing,
      p_is_default_shipping: addressForm.is_default_shipping,
    });
    if (error) { setErrorMessage(error.message); setIsSaving(false); return; }
    setAddressForm({ address_name: "", company_name: "", contact_name: "", address_line_1: "", address_line_2: "", postal_code: "", city: "", state_region: "", country_code: "", phone: "", address_type: "shipping", is_default_billing: false, is_default_shipping: false });
    await loadData(); setSuccessMessage("Address added."); setIsSaving(false);
  }

  async function setAddressDefault(addressId: string, defaultKind: "billing" | "shipping") {
    if (!canEdit) return;
    clearMessages(); setIsSaving(true);
    const { error } = await supabase.rpc("set_customer_address_default", {
      p_customer_id: customerId,
      p_address_id: addressId,
      p_default_kind: defaultKind,
    });
    if (error) { setErrorMessage(error.message); setIsSaving(false); return; }
    await loadData();
    setSuccessMessage(defaultKind === "billing" ? "Default billing address updated." : "Default shipping address updated.");
    setIsSaving(false);
  }

  async function removeAddress`,
  "replace address mutation flow",
);

card = replaceRegex(
  card,
  /\n  async function addPortalUser\(\) \{[\s\S]*?\n  async function removePortalUser\(id: string\) \{[^\n]*\}\n/,
  "\n",
  "remove legacy direct portal mutations",
);

const addressesSection = `    {activeTab === "Addresses" && <Section title="Billing & Shipping Addresses" description="Multiple operational addresses with atomic billing and shipping defaults.">
      <div className="grid gap-3 lg:grid-cols-2">
        {addresses.map((address) => <Card key={address.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-gray-800 dark:text-white/90">{address.address_name}</h3>
                <Badge>{titleCase(address.address_type)}</Badge>
                {address.is_default_billing && <Badge>Default Billing</Badge>}
                {address.is_default_shipping && <Badge>Default Shipping</Badge>}
              </div>
              <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{address.address_line_1}{address.address_line_2 ? \`, \${address.address_line_2}\` : ""}</p>
              <p className="text-sm text-gray-500">{[address.postal_code, address.city, address.state_region, address.country_code].filter(Boolean).join(", ")}</p>
              <p className="mt-2 text-xs text-gray-400">{address.contact_name || address.phone || ""}</p>
            </div>
            {canEdit && <div className="flex max-w-[220px] flex-wrap justify-end gap-2">
              {!address.is_default_billing && address.address_type !== "shipping" && <button disabled={isSaving} onClick={() => void setAddressDefault(address.id, "billing")} className={secondaryButtonClass}>Set Billing Default</button>}
              {!address.is_default_shipping && address.address_type !== "billing" && <button disabled={isSaving} onClick={() => void setAddressDefault(address.id, "shipping")} className={secondaryButtonClass}>Set Shipping Default</button>}
              <button disabled={isSaving} onClick={() => void removeAddress(address.id)} className={dangerButtonClass}>Remove</button>
            </div>}
          </div>
        </Card>)}
      </div>
      {canEdit && <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <h3 className="mb-4 text-sm font-semibold text-gray-800 dark:text-white/90">Add Address</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(["address_name", "company_name", "contact_name", "address_line_1", "address_line_2", "postal_code", "city", "state_region", "country_code", "phone"] as const).map((key) => <Field key={key} label={titleCase(key)}><input value={addressForm[key]} maxLength={key === "country_code" ? 2 : undefined} onChange={(e) => setAddressForm({ ...addressForm, [key]: key === "country_code" ? e.target.value.toUpperCase() : e.target.value })} className={inputClass} /></Field>)}
          <Field label="Address Type"><select value={addressForm.address_type} onChange={(e) => { const addressType = e.target.value as "billing" | "shipping" | "both"; setAddressForm({ ...addressForm, address_type: addressType, is_default_billing: addressType === "shipping" ? false : addressForm.is_default_billing, is_default_shipping: addressType === "billing" ? false : addressForm.is_default_shipping }); }} className={inputClass}><option value="billing">Billing</option><option value="shipping">Shipping</option><option value="both">Both</option></select></Field>
        </div>
        <div className="mt-4 flex gap-4">
          {addressForm.address_type !== "shipping" && <Check label="Default Billing" checked={addressForm.is_default_billing} onChange={(v) => setAddressForm({ ...addressForm, is_default_billing: v })} />}
          {addressForm.address_type !== "billing" && <Check label="Default Shipping" checked={addressForm.is_default_shipping} onChange={(v) => setAddressForm({ ...addressForm, is_default_shipping: v })} />}
        </div>
        <div className="mt-4 flex justify-end"><button onClick={() => void addAddress()} disabled={isSaving} className={primaryButtonClass}>Add Address</button></div>
      </div>}
    </Section>}
`;

card = replaceRegex(
  card,
  /    \{activeTab === "Addresses" && <Section[\s\S]*?\n\n    \{activeTab === "Commercial"/,
  `${addressesSection}\n    {activeTab === "Commercial"`,
  "replace address section",
);

card = replaceRegex(
  card,
  /\n    \{activeTab === "Web \/ Portal" && <Section[\s\S]*?\n\n    \{activeTab === "Notes & Documents"/,
  '\n    {activeTab === "Notes & Documents"',
  "remove legacy portal section",
);

if (card.includes("customer_portal_users")) throw new Error("CustomerCard still contains customer_portal_users after patch");
if (card.includes('"Web / Portal"')) throw new Error("CustomerCard still contains Web / Portal after patch");
if (!card.includes('supabase.rpc("create_customer_address"')) throw new Error("CustomerCard missing create_customer_address RPC");
if (!card.includes('supabase.rpc("set_customer_address_default"')) throw new Error("CustomerCard missing set_customer_address_default RPC");
write(customerCardRel, card);

const oldPortalRel = "modulex-admin/src/components/customers/DealerPortalAccessCard.tsx";
const newPortalRel = "modulex-admin/src/components/customers/CustomerPortalAccessCard.tsx";
let portal = read(oldPortalRel);
portal = replaceExact(portal, "export default function DealerPortalAccessCard", "export default function CustomerPortalAccessCard", "rename portal component");
portal = portal
  .replaceAll("Dealer portal action failed.", "Store portal action failed.")
  .replaceAll("Dealer portal user created as Never Invited.", "Portal user created as Never Invited.")
  .replaceAll("Dealer Portal Access", "Store Portal Access")
  .replaceAll("Dealer portal users", "portal users");
write(newPortalRel, portal);
fs.unlinkSync(file(oldPortalRel));

write("modulex-admin/src/app/(admin)/customers/[id]/page.tsx", `import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CustomerCard from "@/components/customers/CustomerCard";
import CustomerDocumentsPanel from "@/components/customers/CustomerDocumentsPanel";
import CustomerOrderActions from "@/components/customers/CustomerOrderActions";
import CustomerPortalAccessCard from "@/components/customers/CustomerPortalAccessCard";

export const metadata: Metadata = {
  title: "Customer Card | Modulex Admin",
  description: "Customer master data, pricing, contacts, addresses and portal access",
};

export default async function CustomerCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <PageBreadcrumb pageTitle="Customer Card" />
      <CustomerOrderActions />
      <CustomerCard />
      <div className="mt-5">
        <CustomerPortalAccessCard customerId={id} />
      </div>
      <div className="mt-5">
        <CustomerDocumentsPanel customerId={id} />
      </div>
    </div>
  );
}
`);

write("modulex-admin/src/components/customers/CustomerOrderActions.tsx", `"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

const secondaryClass = "inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";
const primaryClass = "inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600";

export default function CustomerOrderActions() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;

  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Customer operations</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Navigate operational records or start the primary sales action.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={\`/customers/\${customerId}/orders\`} className={secondaryClass}>Orders</Link>
          <Link href={\`/customers/\${customerId}/shipments\`} className={secondaryClass}>Shipments</Link>
          <Link href={\`/customers/\${customerId}/installations\`} className={secondaryClass}>Installations</Link>
          <Link href={\`/customers/\${customerId}/invoices\`} className={secondaryClass}>Invoices</Link>
          <Link href={\`/customers/\${customerId}/orders/new\`} className={primaryClass}>New Order</Link>
        </div>
      </div>
    </section>
  );
}
`);

let sqlReadme = read("modulex-admin/sql/README.md");
sqlReadme = replaceExact(
  sqlReadme,
  "2. `customer-master-mutation.sql`\n3. `customer-orders.sql`\n4. `customer-order-payments.sql`\n5. `customer-order-payment-override.sql`\n6. `customer-order-editing.sql`\n7. `customer-invoices.sql`\n8. `customer-invoice-payment-terms.sql`\n9. `customer-shipments.sql`\n10. `customer-installations.sql`\n11. `performance-rls.sql`",
  "2. `customer-master-mutation.sql`\n3. `customer-address-integrity.sql`\n4. `customer-orders.sql`\n5. `customer-order-payments.sql`\n6. `customer-order-payment-override.sql`\n7. `customer-order-editing.sql`\n8. `customer-invoices.sql`\n9. `customer-invoice-payment-terms.sql`\n10. `customer-shipments.sql`\n11. `customer-installations.sql`\n12. `performance-rls.sql`",
  "register address SQL in bootstrap order",
);
sqlReadme = replaceExact(
  sqlReadme,
  "`customer-master-mutation.sql` hardens the existing customer master tables with validated status/type mutations and atomic audit logging. It assumes the base `customers`, `customer_types`, `customer_activity`, `profiles`, and role-helper objects already exist.\n\n",
  "`customer-master-mutation.sql` hardens the existing customer master tables with validated status/type mutations and atomic audit logging. It assumes the base `customers`, `customer_types`, `customer_activity`, `profiles`, and role-helper objects already exist.\n\n`customer-address-integrity.sql` adds SECURITY INVOKER address RPCs that serialize per customer and keep default clearing, assignment/creation, and customer activity in one transaction while preserving existing RLS.\n\n",
  "document address SQL",
);
write("modulex-admin/sql/README.md", sqlReadme);

let roadmap = read("modulex-admin/ADMIN_ROADMAP.md");
roadmap = replaceExact(roadmap, "Main baseline: `8998871b81d0e41840fd67d7af66c835e4b5840b`", "Main baseline: `7160e3b3b05c059ac7d9dc906756f628685a5e3b`", "refresh roadmap main baseline");
roadmap = replaceExact(roadmap, "- [ ] Review customer detail information architecture and action hierarchy.", "- [~] Review customer detail information architecture and action hierarchy.\n  - A1.1C removes the route-level CSS that hid a duplicate legacy portal tab and makes the hierarchy explicit: customer operations → core customer card → secure Store portal lifecycle → documents.", "mark action hierarchy in progress");
roadmap = replaceExact(roadmap, "- [ ] Verify portal-enabled changes use the secure lifecycle API consistently across all customer-detail surfaces. (A1.1C)", "- [~] Verify portal-enabled changes use the secure lifecycle API consistently across all customer-detail surfaces. (A1.1C)\n  - The duplicate browser-DML Web / Portal surface is removed; portal enable/disable and portal-user lifecycle remain only in the dedicated Admin server API surface.", "mark portal lifecycle in progress");
roadmap = replaceExact(roadmap, "- [ ] Verify address management and default-address behavior. (A1.1C)", "- [~] Verify address management and default-address behavior. (A1.1C)\n  - Address create/default assignment moves to SECURITY INVOKER RPCs that lock the customer row and write default changes + activity atomically under existing RLS.", "mark address integrity in progress");
write("modulex-admin/ADMIN_ROADMAP.md", roadmap);

console.log("A1.1C implementation patch applied.");
