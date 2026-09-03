"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import FormHint from "@/components/form/FormHint";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { loadCustomerDocuments, loadCustomerRecord } from "@/lib/customers/read-dedup";
import type {
  Customer,
  CustomerActivity,
  CustomerAddress,
  CustomerCommercialSettings,
  CustomerContact,
  CustomerDocument,
  CustomerNote,
  CustomerStatus,
  CustomerType,
  PaymentTerm,
  PriceGroupLookup,
  ProfileLookup,
} from "@/lib/customers/types";

const tabs = ["General", "Contacts", "Pricing", "Addresses", "Commercial", "Notes & Documents", "Activity"] as const;
type Tab = (typeof tabs)[number];

function statusColor(status: CustomerStatus): "success" | "error" | "warning" | "light" {
  if (status === "active") return "success";
  if (status === "blocked") return "error";
  if (status === "prospect") return "warning";
  return "light";
}
function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function dateTime(value: string | null | undefined) { return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
function optionalNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export default function CustomerCard() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [activeTab, setActiveTab] = useState<Tab>("General");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([]);
  const [priceGroups, setPriceGroups] = useState<PriceGroupLookup[]>([]);
  const [profiles, setProfiles] = useState<ProfileLookup[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [commercial, setCommercial] = useState<CustomerCommercialSettings | null>(null);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [activities, setActivities] = useState<CustomerActivity[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [contactForm, setContactForm] = useState({ first_name: "", last_name: "", job_title: "", department: "", email: "", phone: "", mobile: "", is_primary: false, is_billing_contact: false, is_shipping_contact: false, is_order_contact: false });
  const [addressForm, setAddressForm] = useState({ address_name: "", company_name: "", contact_name: "", address_line_1: "", address_line_2: "", postal_code: "", city: "", state_region: "", country_code: "", phone: "", address_type: "shipping" as "billing" | "shipping" | "both", is_default_billing: false, is_default_shipping: false });
  const [noteForm, setNoteForm] = useState({ note: "", category: "", is_pinned: false });

  const typeMap = useMemo(() => new Map(customerTypes.map((item) => [item.id, item.name])), [customerTypes]);
  const groupMap = useMemo(() => new Map(priceGroups.map((item) => [item.id, item.name])), [priceGroups]);
  const profileMap = useMemo(() => new Map(profiles.map((item) => [item.id, item.full_name || item.email || "Unknown user"])), [profiles]);

  async function logActivity(activityType: string, title: string, description?: string) {
    const { error } = await supabase.from("customer_activity").insert({ customer_id: customerId, activity_type: activityType, title, description: description || null });
    if (!error) {
      const { data } = await supabase.from("customer_activity").select("*").eq("customer_id", customerId).order("created_at", { ascending: false });
      setActivities((data ?? []) as CustomerActivity[]);
    }
  }

  async function loadData() {
    setIsLoading(true);
    setErrorMessage(null);
    const [customerResult, typesResult, groupsResult, profilesResult, termsResult, contactsResult, addressesResult, commercialResult, notesResult, documentsResult, activityResult] = await Promise.all([
      loadCustomerRecord(customerId).then(
        (data) => ({ data, error: null }),
        (error: Error) => ({ data: null, error })
      ),
      supabase.from("customer_types").select("id, system_key, name, sort_order, is_active").eq("is_active", true).order("sort_order"),
      supabase.from("price_groups").select("id, name, system_key, sort_order, is_base_price, is_active, available_for_orders, requires_approval, internal_only").eq("is_active", true).eq("available_for_orders", true).eq("internal_only", false).order("sort_order"),
      supabase.from("profiles").select("id, full_name, email, role, is_active").eq("is_active", true).order("full_name"),
      supabase.from("payment_terms").select("id, system_key, name, days, sort_order, is_active").eq("is_active", true).order("sort_order"),
      supabase.from("customer_contacts").select("*").eq("customer_id", customerId).order("is_primary", { ascending: false }).order("created_at"),
      supabase.from("customer_addresses").select("*").eq("customer_id", customerId).order("is_default_shipping", { ascending: false }).order("address_name"),
      supabase.from("customer_commercial_settings").select("*").eq("customer_id", customerId).maybeSingle(),
      supabase.from("customer_notes").select("*").eq("customer_id", customerId).order("is_pinned", { ascending: false }).order("created_at", { ascending: false }),
      loadCustomerDocuments(customerId).then(
        (data) => ({ data, error: null }),
        (error: Error) => ({ data: null, error })
      ),
      supabase.from("customer_activity").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(100),
    ]);
    const firstError = customerResult.error || typesResult.error || groupsResult.error || profilesResult.error || termsResult.error || contactsResult.error || addressesResult.error || commercialResult.error || notesResult.error || documentsResult.error || activityResult.error;
    if (firstError) { setErrorMessage(firstError.message); setIsLoading(false); return; }
    setCustomer(customerResult.data as Customer);
    setCustomerTypes((typesResult.data ?? []) as CustomerType[]);
    setPriceGroups((groupsResult.data ?? []) as PriceGroupLookup[]);
    setProfiles((profilesResult.data ?? []) as ProfileLookup[]);
    setPaymentTerms((termsResult.data ?? []) as PaymentTerm[]);
    setContacts((contactsResult.data ?? []) as CustomerContact[]);
    setAddresses((addressesResult.data ?? []) as CustomerAddress[]);
    setCommercial((commercialResult.data ?? null) as CustomerCommercialSettings | null);
    setNotes((notesResult.data ?? []) as CustomerNote[]);
    setDocuments((documentsResult.data ?? []) as CustomerDocument[]);
    setActivities((activityResult.data ?? []) as CustomerActivity[]);
    setIsLoading(false);
  }

  useEffect(() => {
    async function initialize() {
      const [{ profile, error }] = await Promise.all([getCurrentProfile(), loadData()]);
      if (error) { setErrorMessage(error.message); setIsLoading(false); return; }
      setCanEdit(["super_admin", "admin", "sales"].includes(profile?.role ?? ""));
    }
    void initialize();
  }, [customerId]);

  function clearMessages() { setErrorMessage(null); setSuccessMessage(null); }

  async function saveCustomerMaster() {
    if (!customer || !canEdit) return;
    clearMessages(); setIsSaving(true);
    const { data, error } = await supabase.rpc("update_customer_master", {
      p_customer_id: customer.id,
      p_name: customer.name.trim(),
      p_legal_name: customer.legal_name,
      p_customer_type_id: customer.customer_type_id,
      p_status: customer.status,
      p_tax_number: customer.tax_number,
      p_registration_number: customer.registration_number,
      p_email: customer.email,
      p_phone: customer.phone,
      p_website: customer.website,
      p_country_code: customer.country_code,
      p_language_code: customer.language_code,
      p_currency_code: customer.currency_code,
      p_sales_rep_id: customer.sales_rep_id,
      p_customer_since: customer.customer_since,
    });
    if (error) { setErrorMessage(error.message); setIsSaving(false); return; }
    setCustomer(data as Customer);
    const { data: activityData } = await supabase.from("customer_activity").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(100);
    setActivities((activityData ?? []) as CustomerActivity[]);
    setSuccessMessage("Customer updated successfully.");
    setIsSaving(false);
  }

  async function savePricing() {
    if (!customer || !canEdit) return;
    clearMessages(); setIsSaving(true);
    const desiredPriceGroupId = customer.price_group_id;
    const { error: currencyError } = await supabase.from("customers").update({ currency_code: customer.currency_code }).eq("id", customer.id);
    if (currencyError) { setErrorMessage(currencyError.message); setIsSaving(false); return; }
    const { data, error } = await supabase.rpc("request_customer_price_group_change", { p_customer_id: customer.id, p_price_group_id: desiredPriceGroupId });
    if (error) { setErrorMessage(error.message); setIsSaving(false); await loadData(); return; }
    if (data === "approval_requested") {
      await loadData();
      setSuccessMessage("Approval requested. The customer price group was not changed; currency changes were saved.");
    } else {
      await logActivity("customer_updated", "Customer pricing assignment updated");
      await loadData();
      setSuccessMessage(data === "unchanged" ? "Pricing settings saved; price group was unchanged." : "Customer pricing settings saved.");
    }
    setIsSaving(false);
  }

  async function saveCommercial() {
    if (!commercial || !canEdit) return;
    clearMessages(); setIsSaving(true);
    const { data, error } = await supabase.rpc("save_customer_commercial_settings", {
      p_customer_id: customerId,
      p_payment_term_id: commercial.payment_term_id,
      p_credit_limit: optionalNumber(commercial.credit_limit),
      p_minimum_order_amount: optionalNumber(commercial.minimum_order_amount),
      p_tax_exempt: commercial.tax_exempt,
      p_tax_exemption_number: commercial.tax_exemption_number?.trim() || null,
      p_credit_hold: commercial.credit_hold,
      p_credit_hold_reason: commercial.credit_hold_reason?.trim() || null,
      p_discount_notes: commercial.discount_notes?.trim() || null,
      p_order_notes: commercial.order_notes?.trim() || null,
    });
    if (error) { setErrorMessage(error.message); setIsSaving(false); await loadData(); return; }
    if (data === "approval_requested") {
      await loadData();
      setSuccessMessage("Approval requested. Protected commercial values were not changed until Admin approval.");
    } else {
      await logActivity("commercial_updated", "Commercial settings updated");
      await loadData();
      setSuccessMessage("Commercial settings saved.");
    }
    setIsSaving(false);
  }

  async function addContact() {
    if (!contactForm.first_name.trim()) return setErrorMessage("First name is required.");
    clearMessages(); setIsSaving(true);
    if (contactForm.is_primary) await supabase.from("customer_contacts").update({ is_primary: false }).eq("customer_id", customerId).eq("is_primary", true);
    const { error } = await supabase.from("customer_contacts").insert({ customer_id: customerId, ...contactForm, first_name: contactForm.first_name.trim(), last_name: contactForm.last_name.trim() || null, job_title: contactForm.job_title.trim() || null, department: contactForm.department.trim() || null, email: contactForm.email.trim() || null, phone: contactForm.phone.trim() || null, mobile: contactForm.mobile.trim() || null });
    if (error) { setErrorMessage(error.message); setIsSaving(false); return; }
    setContactForm({ first_name: "", last_name: "", job_title: "", department: "", email: "", phone: "", mobile: "", is_primary: false, is_billing_contact: false, is_shipping_contact: false, is_order_contact: false });
    await logActivity("contact_added", "Contact added"); await loadData(); setSuccessMessage("Contact added."); setIsSaving(false);
  }
  async function removeContact(id: string) { if (!confirm("Remove this contact?")) return; const { error } = await supabase.from("customer_contacts").delete().eq("id", id); if (error) return setErrorMessage(error.message); await logActivity("contact_removed", "Contact removed"); await loadData(); }

  async function addAddress() {
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

  async function removeAddress(id: string) { if (!confirm("Remove this address?")) return; const { error } = await supabase.from("customer_addresses").delete().eq("id", id); if (error) return setErrorMessage(error.message); await logActivity("address_removed", "Address removed"); await loadData(); }


  async function addNote() {
    if (!noteForm.note.trim()) return setErrorMessage("Note cannot be empty.");
    clearMessages(); setIsSaving(true);
    const { error } = await supabase.from("customer_notes").insert({ customer_id: customerId, note: noteForm.note.trim(), category: noteForm.category.trim() || null, is_pinned: noteForm.is_pinned });
    if (error) { setErrorMessage(error.message); setIsSaving(false); return; }
    setNoteForm({ note: "", category: "", is_pinned: false });
    await logActivity("note_added", "Customer note added"); await loadData(); setSuccessMessage("Note added."); setIsSaving(false);
  }
  async function removeNote(id: string) { if (!confirm("Remove this note?")) return; const { error } = await supabase.from("customer_notes").delete().eq("id", id); if (error) return setErrorMessage(error.message); await logActivity("note_removed", "Customer note removed"); await loadData(); }

  if (isLoading) return <ComponentCard title="Customer"><FormHint>Loading customer...</FormHint></ComponentCard>;
  if (!customer || errorMessage && !customer) return <Alert variant="error" title="Customer unavailable" message={errorMessage || "Customer not found."} />;

  return <div className="space-y-5">
    <ComponentCard title={customer.name} headerAction={<Link href="/customers">Back to Customers</Link>}>
      <div className="flex flex-wrap items-center gap-2"><Badge color={statusColor(customer.status)}>{titleCase(customer.status)}</Badge><span>{customer.customer_code}</span><span>{customer.customer_type_id ? typeMap.get(customer.customer_type_id) ?? "—" : "—"}</span><span>{customer.price_group_id ? groupMap.get(customer.price_group_id) ?? "—" : "—"}</span><span>{customer.country_code || "No country"}</span><span>Portal: {customer.portal_enabled ? "Enabled" : "Disabled"}</span></div>
      <div className="flex min-w-max gap-1 overflow-x-auto">{tabs.map((tab) => <Button key={tab} type="button" onClick={() => setActiveTab(tab)} variant={activeTab === tab ? "primary" : "ghost"}>{tab}</Button>)}</div>
    </ComponentCard>

    {errorMessage && <Alert variant="error" title="Unable to update customer" message={errorMessage} />}
    {successMessage && <Alert variant="success" title="Customer updated" message={successMessage} />}

    {activeTab === "General" && <Section title="General Information" description="Core customer identity and account status."><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Field label="Customer Code"><Input value={customer.customer_code} disabled /></Field>
      <Field label="Company / Customer Name"><Input value={customer.name} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></Field>
      <Field label="Legal Name"><Input value={customer.legal_name ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, legal_name: e.target.value || null })} /></Field>
      <Field label="Customer Type"><Select value={customer.customer_type_id ?? ""} disabled={!canEdit} onChange={(value) => setCustomer({ ...customer, customer_type_id: value || null })} options={customerTypes.map((item) => ({ value: item.id, label: item.name }))} placeholder="None" allowEmpty /></Field>
      <Field label="Status"><Select value={customer.status} disabled={!canEdit} onChange={(value) => setCustomer({ ...customer, status: value as CustomerStatus })} options={(["active", "prospect", "inactive", "blocked"] as CustomerStatus[]).map((value) => ({ value, label: titleCase(value) }))} /></Field>
      <Field label="Customer Since"><Input type="date" value={customer.customer_since ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, customer_since: e.target.value || null })} /></Field>
      <Field label="Tax / VAT Number"><Input value={customer.tax_number ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, tax_number: e.target.value || null })} /></Field>
      <Field label="Registration Number"><Input value={customer.registration_number ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, registration_number: e.target.value || null })} /></Field>
      <Field label="Country Code"><Input maxLength={2} value={customer.country_code ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, country_code: e.target.value.toUpperCase() || null })} /></Field>
      <Field label="Primary Email"><Input type="email" value={customer.email ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, email: e.target.value || null })} /></Field>
      <Field label="Primary Phone"><Input value={customer.phone ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, phone: e.target.value || null })} /></Field>
      <Field label="Website"><Input value={customer.website ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, website: e.target.value || null })} /></Field>
      <Field label="Language"><Input value={customer.language_code} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, language_code: e.target.value })} /></Field>
      <Field label="Currency"><Input maxLength={3} value={customer.currency_code} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, currency_code: e.target.value.toUpperCase() })} /></Field>
      <Field label="Sales Representative"><Select value={customer.sales_rep_id ?? ""} disabled={!canEdit} onChange={(value) => setCustomer({ ...customer, sales_rep_id: value || null })} options={profiles.filter((item) => ["super_admin", "admin", "sales"].includes(item.role)).map((item) => ({ value: item.id, label: item.full_name || item.email || "" }))} placeholder="Unassigned" allowEmpty /></Field>
    </div>{canEdit && <div className="mt-5 flex justify-end"><Button disabled={isSaving || !customer.name.trim()} onClick={() => void saveCustomerMaster()}>{isSaving ? "Saving..." : "Save General"}</Button></div>}</Section>}

    {activeTab === "Contacts" && <Section title="Contacts" description="People associated with this customer account."><div className="grid gap-3 lg:grid-cols-2">{contacts.map((contact) => <Card key={contact.id}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{contact.first_name} {contact.last_name}</h3>{contact.is_primary && <Badge>Primary</Badge>}</div><p className="mt-1 text-sm">{[contact.job_title, contact.department].filter(Boolean).join(" • ") || "No role"}</p><p className="mt-3 text-sm">{contact.email || "—"}</p><p className="text-sm">{contact.mobile || contact.phone || "—"}</p><div className="mt-3 flex flex-wrap gap-1">{contact.is_billing_contact && <Badge>Billing</Badge>}{contact.is_shipping_contact && <Badge>Shipping</Badge>}{contact.is_order_contact && <Badge>Orders</Badge>}</div></div>{canEdit && <Button onClick={() => void removeContact(contact.id)} variant="danger">Remove</Button>}</div></Card>)}</div>{canEdit && <div className="mt-5 border p-4"><h3 className="mb-4 text-sm font-semibold">Add Contact</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{(["first_name", "last_name", "job_title", "department", "email", "phone", "mobile"] as const).map((key) => <Field key={key} label={titleCase(key)}><Input value={contactForm[key]} onChange={(e) => setContactForm({ ...contactForm, [key]: e.target.value })} /></Field>)}</div><div className="mt-4 flex flex-wrap gap-4"><Check label="Primary" checked={contactForm.is_primary} onChange={(v) => setContactForm({ ...contactForm, is_primary: v })} /><Check label="Billing" checked={contactForm.is_billing_contact} onChange={(v) => setContactForm({ ...contactForm, is_billing_contact: v })} /><Check label="Shipping" checked={contactForm.is_shipping_contact} onChange={(v) => setContactForm({ ...contactForm, is_shipping_contact: v })} /><Check label="Orders" checked={contactForm.is_order_contact} onChange={(v) => setContactForm({ ...contactForm, is_order_contact: v })} /></div><div className="mt-4 flex justify-end"><Button onClick={() => void addContact()} disabled={isSaving}>Add Contact</Button></div></div>}</Section>}

    {activeTab === "Pricing" && <Section title="Pricing" description="Customer-specific price group assignment."><div className="grid gap-4 md:grid-cols-2"><Field label="Default Price Group"><Select value={customer.price_group_id ?? ""} disabled={!canEdit} onChange={(value) => setCustomer({ ...customer, price_group_id: value || null })} options={priceGroups.map((item) => ({ value: item.id, label: `${item.name}${item.is_base_price ? " (Base)" : ""}${item.requires_approval ? " · Approval" : ""}` }))} placeholder="No price group" allowEmpty /></Field><Field label="Currency"><Input value={customer.currency_code} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, currency_code: e.target.value.toUpperCase() })} /></Field></div><Alert variant="info" title="Pricing assignment" message="Store pricing resolves from the assigned order-eligible price group. For Sales users, changing the default price group is submitted to Admin approval; internal Cost pricing cannot be assigned." />{canEdit && <div className="mt-5 flex justify-end"><Button onClick={() => void savePricing()} disabled={isSaving}>{isSaving ? "Saving..." : "Save Pricing"}</Button></div>}</Section>}

    {activeTab === "Addresses" && <Section title="Billing & Shipping Addresses" description="Multiple operational addresses with atomic billing and shipping defaults.">
      <div className="grid gap-3 lg:grid-cols-2">
        {addresses.map((address) => <Card key={address.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{address.address_name}</h3>
                <Badge>{titleCase(address.address_type)}</Badge>
                {address.is_default_billing && <Badge>Default Billing</Badge>}
                {address.is_default_shipping && <Badge>Default Shipping</Badge>}
              </div>
              <p className="mt-3 text-sm">{address.address_line_1}{address.address_line_2 ? `, ${address.address_line_2}` : ""}</p>
              <p className="text-sm">{[address.postal_code, address.city, address.state_region, address.country_code].filter(Boolean).join(", ")}</p>
              <p className="mt-2 text-xs">{address.contact_name || address.phone || ""}</p>
            </div>
            {canEdit && <div className="flex max-w-[220px] flex-wrap justify-end gap-2">
              {!address.is_default_billing && address.address_type !== "shipping" && <Button disabled={isSaving} onClick={() => void setAddressDefault(address.id, "billing")} variant="outline">Set Billing Default</Button>}
              {!address.is_default_shipping && address.address_type !== "billing" && <Button disabled={isSaving} onClick={() => void setAddressDefault(address.id, "shipping")} variant="outline">Set Shipping Default</Button>}
              <Button disabled={isSaving} onClick={() => void removeAddress(address.id)} variant="danger">Remove</Button>
            </div>}
          </div>
        </Card>)}
      </div>
      {canEdit && <div className="mt-5 border p-4">
        <h3 className="mb-4 text-sm font-semibold">Add Address</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(["address_name", "company_name", "contact_name", "address_line_1", "address_line_2", "postal_code", "city", "state_region", "country_code", "phone"] as const).map((key) => <Field key={key} label={titleCase(key)}><Input value={addressForm[key]} maxLength={key === "country_code" ? 2 : undefined} onChange={(e) => setAddressForm({ ...addressForm, [key]: key === "country_code" ? e.target.value.toUpperCase() : e.target.value })} /></Field>)}
          <Field label="Address Type"><Select value={addressForm.address_type} onChange={(value) => { const addressType = value as "billing" | "shipping" | "both"; setAddressForm({ ...addressForm, address_type: addressType, is_default_billing: addressType === "shipping" ? false : addressForm.is_default_billing, is_default_shipping: addressType === "billing" ? false : addressForm.is_default_shipping }); }} options={[{ value: "billing", label: "Billing" }, { value: "shipping", label: "Shipping" }, { value: "both", label: "Both" }]} /></Field>
        </div>
        <div className="mt-4 flex gap-4">
          {addressForm.address_type !== "shipping" && <Check label="Default Billing" checked={addressForm.is_default_billing} onChange={(v) => setAddressForm({ ...addressForm, is_default_billing: v })} />}
          {addressForm.address_type !== "billing" && <Check label="Default Shipping" checked={addressForm.is_default_shipping} onChange={(v) => setAddressForm({ ...addressForm, is_default_shipping: v })} />}
        </div>
        <div className="mt-4 flex justify-end"><Button onClick={() => void addAddress()} disabled={isSaving}>Add Address</Button></div>
      </div>}
    </Section>}

    {activeTab === "Commercial" && commercial && <Section title="Commercial" description="Payment terms, limits and order controls. Protected changes made by Sales require Admin approval."><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Field label="Payment Terms"><Select value={commercial.payment_term_id ?? ""} disabled={!canEdit} onChange={(value) => setCommercial({ ...commercial, payment_term_id: value || null })} options={paymentTerms.map((item) => ({ value: item.id, label: item.name }))} placeholder="None" allowEmpty /></Field><Field label="Credit Limit"><Input type="number" min="0" step="0.01" value={commercial.credit_limit ?? ""} disabled={!canEdit} onChange={(e) => setCommercial({ ...commercial, credit_limit: e.target.value || null })} /></Field><Field label="Minimum Order"><Input type="number" min="0" step="0.01" value={commercial.minimum_order_amount ?? ""} disabled={!canEdit} onChange={(e) => setCommercial({ ...commercial, minimum_order_amount: e.target.value || null })} /></Field><Field label="Tax Exemption Number"><Input value={commercial.tax_exemption_number ?? ""} disabled={!canEdit} onChange={(e) => setCommercial({ ...commercial, tax_exemption_number: e.target.value || null })} /></Field><Field label="Credit Hold Reason"><Input value={commercial.credit_hold_reason ?? ""} disabled={!canEdit} onChange={(e) => setCommercial({ ...commercial, credit_hold_reason: e.target.value || null })} /></Field></div><div className="mt-4 flex gap-5"><Check label="Tax Exempt" checked={commercial.tax_exempt} disabled={!canEdit} onChange={(v) => setCommercial({ ...commercial, tax_exempt: v })} /><Check label="Credit Hold" checked={commercial.credit_hold} disabled={!canEdit} onChange={(v) => setCommercial({ ...commercial, credit_hold: v })} /></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Discount Notes"><TextArea value={commercial.discount_notes ?? ""} disabled={!canEdit} onChange={(value) => setCommercial({ ...commercial, discount_notes: value || null })} /></Field><Field label="Order Notes"><TextArea value={commercial.order_notes ?? ""} disabled={!canEdit} onChange={(value) => setCommercial({ ...commercial, order_notes: value || null })} /></Field></div>{canEdit && <div className="mt-5 flex justify-end"><Button onClick={() => void saveCommercial()} disabled={isSaving}>{isSaving ? "Saving..." : "Save Commercial"}</Button></div>}</Section>}

    {activeTab === "Notes & Documents" && <Section title="Notes & Documents" description="Internal customer notes and document metadata."><div className="grid gap-6 xl:grid-cols-2"><div><h3 className="mb-3 text-sm font-semibold">Notes</h3><div className="space-y-3">{notes.map((note) => <Card key={note.id}><div className="flex items-start justify-between gap-3"><div>{note.is_pinned && <Badge>Pinned</Badge>}<p className="mt-2 whitespace-pre-wrap text-sm">{note.note}</p><p className="mt-2 text-xs">{note.category || "General"} • {dateTime(note.created_at)}</p></div>{canEdit && <Button onClick={() => void removeNote(note.id)} variant="danger">Remove</Button>}</div></Card>)}</div>{canEdit && <div className="mt-4 border p-4"><Field label="New Note"><TextArea value={noteForm.note} onChange={(value) => setNoteForm({ ...noteForm, note: value })} /></Field><div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Category"><Input value={noteForm.category} onChange={(e) => setNoteForm({ ...noteForm, category: e.target.value })} /></Field><div className="flex items-end pb-2"><Check label="Pin note" checked={noteForm.is_pinned} onChange={(v) => setNoteForm({ ...noteForm, is_pinned: v })} /></div></div><div className="mt-3 flex justify-end"><Button onClick={() => void addNote()}>Add Note</Button></div></div>}</div><div><h3 className="mb-3 text-sm font-semibold">Documents</h3><div className="space-y-3">{documents.length === 0 ? <div className="border border-dashed p-6 text-center text-sm">No documents uploaded yet.</div> : documents.map((document) => <Card key={document.id}><p className="font-medium">{document.file_name}</p><p className="mt-1 text-xs">{document.document_type || "Document"} • {dateTime(document.created_at)}</p><p className="mt-2 break-all text-xs">{document.storage_path}</p></Card>)}</div><div className="mt-4 border p-4 text-xs leading-5">Document metadata is ready. File upload will be connected after the <strong>customer-documents</strong> Supabase Storage bucket and its policies are confirmed during integration testing.</div></div></div></Section>}

    {activeTab === "Activity" && <Section title="Activity" description="Append-only customer activity timeline."><div className="space-y-3">{activities.length === 0 ? <p className="py-8 text-center text-sm">No activity yet.</p> : activities.map((activity) => <div key={activity.id} className="relative border p-4"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-medium">{activity.title}</p>{activity.description && <p className="mt-1 text-sm">{activity.description}</p>}<p className="mt-2 text-xs">{titleCase(activity.activity_type)}{activity.actor_user_id ? ` • ${profileMap.get(activity.actor_user_id) ?? "User"}` : ""}</p></div><span className="text-xs">{dateTime(activity.created_at)}</span></div></div>)}</div></Section>}
  </div>;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <ComponentCard title={title} desc={description}>{children}</ComponentCard>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label>{label}</Label>{children}</div>; }
function Card({ children }: { children: React.ReactNode }) { return <div className="space-y-2 p-4">{children}</div>; }
function Check({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) { return <Checkbox label={label} checked={checked} disabled={disabled} onChange={onChange} />; }
