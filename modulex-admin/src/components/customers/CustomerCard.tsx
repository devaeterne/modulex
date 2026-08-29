"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type {
  Customer,
  CustomerActivity,
  CustomerAddress,
  CustomerCommercialSettings,
  CustomerContact,
  CustomerDocument,
  CustomerNote,
  CustomerPortalUser,
  CustomerStatus,
  CustomerType,
  PaymentTerm,
  PriceGroupLookup,
  ProfileLookup,
} from "@/lib/customers/types";

const tabs = ["General", "Contacts", "Pricing", "Addresses", "Commercial", "Web / Portal", "Notes & Documents", "Activity"] as const;
type Tab = (typeof tabs)[number];

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs transition placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-500";
const textareaClass = "min-h-[100px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs transition placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const primaryButtonClass = "inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass = "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";
const dangerButtonClass = "inline-flex h-9 items-center justify-center rounded-lg border border-error-200 bg-error-50 px-3 text-xs font-medium text-error-700 transition hover:bg-error-100 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400";

function statusClass(status: CustomerStatus) {
  if (status === "active") return "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400";
  if (status === "blocked") return "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400";
  if (status === "prospect") return "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400";
  return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
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
  const [portalUsers, setPortalUsers] = useState<CustomerPortalUser[]>([]);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [activities, setActivities] = useState<CustomerActivity[]>([]);
  const [canManagePortal, setCanManagePortal] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [contactForm, setContactForm] = useState({ first_name: "", last_name: "", job_title: "", department: "", email: "", phone: "", mobile: "", is_primary: false, is_billing_contact: false, is_shipping_contact: false, is_order_contact: false });
  const [addressForm, setAddressForm] = useState({ address_name: "", company_name: "", contact_name: "", address_line_1: "", address_line_2: "", postal_code: "", city: "", state_region: "", country_code: "", phone: "", address_type: "shipping" as "billing" | "shipping" | "both", is_default_billing: false, is_default_shipping: false });
  const [portalForm, setPortalForm] = useState({ full_name: "", login_email: "", portal_role: "buyer" as "admin" | "buyer" | "viewer", status: "never_invited" as "never_invited" | "invited" | "active" | "suspended", is_primary: false });
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
    const [customerResult, typesResult, groupsResult, profilesResult, termsResult, contactsResult, addressesResult, commercialResult, portalResult, notesResult, documentsResult, activityResult] = await Promise.all([
      supabase.from("customers").select("*").eq("id", customerId).single(),
      supabase.from("customer_types").select("id, system_key, name, sort_order, is_active").eq("is_active", true).order("sort_order"),
      supabase.from("price_groups").select("id, name, system_key, sort_order, is_base_price, is_active, available_for_orders, requires_approval, internal_only").eq("is_active", true).eq("available_for_orders", true).eq("internal_only", false).order("sort_order"),
      supabase.from("profiles").select("id, full_name, email, role, is_active").eq("is_active", true).order("full_name"),
      supabase.from("payment_terms").select("id, system_key, name, days, sort_order, is_active").eq("is_active", true).order("sort_order"),
      supabase.from("customer_contacts").select("*").eq("customer_id", customerId).order("is_primary", { ascending: false }).order("created_at"),
      supabase.from("customer_addresses").select("*").eq("customer_id", customerId).order("is_default_shipping", { ascending: false }).order("address_name"),
      supabase.from("customer_commercial_settings").select("*").eq("customer_id", customerId).maybeSingle(),
      supabase.from("customer_portal_users").select("*").eq("customer_id", customerId).order("is_primary", { ascending: false }).order("created_at"),
      supabase.from("customer_notes").select("*").eq("customer_id", customerId).order("is_pinned", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("customer_documents").select("*").eq("customer_id", customerId).eq("is_active", true).order("created_at", { ascending: false }),
      supabase.from("customer_activity").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(100),
    ]);
    const firstError = customerResult.error || typesResult.error || groupsResult.error || profilesResult.error || termsResult.error || contactsResult.error || addressesResult.error || commercialResult.error || portalResult.error || notesResult.error || documentsResult.error || activityResult.error;
    if (firstError) { setErrorMessage(firstError.message); setIsLoading(false); return; }
    setCustomer(customerResult.data as Customer);
    setCustomerTypes((typesResult.data ?? []) as CustomerType[]);
    setPriceGroups((groupsResult.data ?? []) as PriceGroupLookup[]);
    setProfiles((profilesResult.data ?? []) as ProfileLookup[]);
    setPaymentTerms((termsResult.data ?? []) as PaymentTerm[]);
    setContacts((contactsResult.data ?? []) as CustomerContact[]);
    setAddresses((addressesResult.data ?? []) as CustomerAddress[]);
    setCommercial((commercialResult.data ?? null) as CustomerCommercialSettings | null);
    setPortalUsers((portalResult.data ?? []) as CustomerPortalUser[]);
    setNotes((notesResult.data ?? []) as CustomerNote[]);
    setDocuments((documentsResult.data ?? []) as CustomerDocument[]);
    setActivities((activityResult.data ?? []) as CustomerActivity[]);
    setIsLoading(false);
  }

  useEffect(() => {
    async function initialize() {
      const { profile, error } = await getCurrentProfile();
      if (error) { setErrorMessage(error.message); setIsLoading(false); return; }
      setCanEdit(["super_admin", "admin", "sales"].includes(profile?.role ?? ""));
      setCanManagePortal(["super_admin", "admin"].includes(profile?.role ?? ""));
      await loadData();
    }
    void initialize();
  }, [customerId]);

  function clearMessages() { setErrorMessage(null); setSuccessMessage(null); }

  async function saveCustomer(fields: Partial<Customer>, activityTitle: string) {
    if (!customer || !canEdit) return;
    clearMessages(); setIsSaving(true);
    const { data, error } = await supabase.from("customers").update(fields).eq("id", customer.id).select("*").single();
    if (error) { setErrorMessage(error.message); setIsSaving(false); return; }
    setCustomer(data as Customer);
    await logActivity("customer_updated", activityTitle);
    setSuccessMessage("Customer updated successfully.");
    setIsSaving(false);
  }

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
    if (addressForm.is_default_billing) await supabase.from("customer_addresses").update({ is_default_billing: false }).eq("customer_id", customerId).eq("is_default_billing", true);
    if (addressForm.is_default_shipping) await supabase.from("customer_addresses").update({ is_default_shipping: false }).eq("customer_id", customerId).eq("is_default_shipping", true);
    const { error } = await supabase.from("customer_addresses").insert({ customer_id: customerId, ...addressForm, country_code: addressForm.country_code.toUpperCase(), company_name: addressForm.company_name.trim() || null, contact_name: addressForm.contact_name.trim() || null, address_line_2: addressForm.address_line_2.trim() || null, postal_code: addressForm.postal_code.trim() || null, state_region: addressForm.state_region.trim() || null, phone: addressForm.phone.trim() || null });
    if (error) { setErrorMessage(error.message); setIsSaving(false); return; }
    setAddressForm({ address_name: "", company_name: "", contact_name: "", address_line_1: "", address_line_2: "", postal_code: "", city: "", state_region: "", country_code: "", phone: "", address_type: "shipping", is_default_billing: false, is_default_shipping: false });
    await logActivity("address_added", "Address added"); await loadData(); setSuccessMessage("Address added."); setIsSaving(false);
  }
  async function removeAddress(id: string) { if (!confirm("Remove this address?")) return; const { error } = await supabase.from("customer_addresses").delete().eq("id", id); if (error) return setErrorMessage(error.message); await logActivity("address_removed", "Address removed"); await loadData(); }

  async function addPortalUser() {
    if (!canManagePortal) return;
    if (!portalForm.login_email.trim()) return setErrorMessage("Login email is required.");
    clearMessages(); setIsSaving(true);
    if (portalForm.is_primary) await supabase.from("customer_portal_users").update({ is_primary: false }).eq("customer_id", customerId).eq("is_primary", true);
    const { error } = await supabase.from("customer_portal_users").insert({ customer_id: customerId, full_name: portalForm.full_name.trim() || null, login_email: portalForm.login_email.trim().toLowerCase(), portal_role: portalForm.portal_role, status: portalForm.status, is_primary: portalForm.is_primary });
    if (error) { setErrorMessage(error.message); setIsSaving(false); return; }
    setPortalForm({ full_name: "", login_email: "", portal_role: "buyer", status: "never_invited", is_primary: false });
    await logActivity("portal_user_added", "Portal user added"); await loadData(); setSuccessMessage("Portal user added."); setIsSaving(false);
  }
  async function removePortalUser(id: string) { if (!canManagePortal || !confirm("Remove this portal user?")) return; const { error } = await supabase.from("customer_portal_users").delete().eq("id", id); if (error) return setErrorMessage(error.message); await logActivity("portal_user_removed", "Portal user removed"); await loadData(); }

  async function addNote() {
    if (!noteForm.note.trim()) return setErrorMessage("Note cannot be empty.");
    clearMessages(); setIsSaving(true);
    const { error } = await supabase.from("customer_notes").insert({ customer_id: customerId, note: noteForm.note.trim(), category: noteForm.category.trim() || null, is_pinned: noteForm.is_pinned });
    if (error) { setErrorMessage(error.message); setIsSaving(false); return; }
    setNoteForm({ note: "", category: "", is_pinned: false });
    await logActivity("note_added", "Customer note added"); await loadData(); setSuccessMessage("Note added."); setIsSaving(false);
  }
  async function removeNote(id: string) { if (!confirm("Remove this note?")) return; const { error } = await supabase.from("customer_notes").delete().eq("id", id); if (error) return setErrorMessage(error.message); await logActivity("note_removed", "Customer note removed"); await loadData(); }

  if (isLoading) return <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" /><p className="text-sm text-gray-500">Loading customer...</p></div></div>;
  if (!customer || errorMessage && !customer) return <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{errorMessage || "Customer not found."}</div>;

  return <div className="space-y-5">
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{customer.name}</h1><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(customer.status)}`}>{titleCase(customer.status)}</span></div><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500 dark:text-gray-400"><span>{customer.customer_code}</span><span>{customer.customer_type_id ? typeMap.get(customer.customer_type_id) ?? "—" : "—"}</span><span>{customer.price_group_id ? groupMap.get(customer.price_group_id) ?? "—" : "—"}</span><span>{customer.country_code || "No country"}</span><span>Portal: {customer.portal_enabled ? "Enabled" : "Disabled"}</span></div></div><Link href="/customers" className={secondaryButtonClass}>Back to Customers</Link></div>
      <div className="mt-6 overflow-x-auto border-t border-gray-100 pt-4 dark:border-gray-800"><div className="flex min-w-max gap-1">{tabs.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === tab ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-white"}`}>{tab}</button>)}</div></div>
    </div>

    {errorMessage && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">{errorMessage}</div>}
    {successMessage && <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">{successMessage}</div>}

    {activeTab === "General" && <Section title="General Information" description="Core customer identity and account status."><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Field label="Customer Code"><input value={customer.customer_code} disabled className={inputClass} /></Field>
      <Field label="Company / Customer Name"><input value={customer.name} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className={inputClass} /></Field>
      <Field label="Legal Name"><input value={customer.legal_name ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, legal_name: e.target.value || null })} className={inputClass} /></Field>
      <Field label="Customer Type"><select value={customer.customer_type_id ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, customer_type_id: e.target.value || null })} className={inputClass}><option value="">None</option>{customerTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Status"><select value={customer.status} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, status: e.target.value as CustomerStatus })} className={inputClass}><option value="active">Active</option><option value="prospect">Prospect</option><option value="inactive">Inactive</option><option value="blocked">Blocked</option></select></Field>
      <Field label="Customer Since"><input type="date" value={customer.customer_since ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, customer_since: e.target.value || null })} className={inputClass} /></Field>
      <Field label="Tax / VAT Number"><input value={customer.tax_number ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, tax_number: e.target.value || null })} className={inputClass} /></Field>
      <Field label="Registration Number"><input value={customer.registration_number ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, registration_number: e.target.value || null })} className={inputClass} /></Field>
      <Field label="Country Code"><input maxLength={2} value={customer.country_code ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, country_code: e.target.value.toUpperCase() || null })} className={inputClass} /></Field>
      <Field label="Primary Email"><input type="email" value={customer.email ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, email: e.target.value || null })} className={inputClass} /></Field>
      <Field label="Primary Phone"><input value={customer.phone ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, phone: e.target.value || null })} className={inputClass} /></Field>
      <Field label="Website"><input value={customer.website ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, website: e.target.value || null })} className={inputClass} /></Field>
      <Field label="Language"><input value={customer.language_code} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, language_code: e.target.value })} className={inputClass} /></Field>
      <Field label="Currency"><input maxLength={3} value={customer.currency_code} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, currency_code: e.target.value.toUpperCase() })} className={inputClass} /></Field>
      <Field label="Sales Representative"><select value={customer.sales_rep_id ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, sales_rep_id: e.target.value || null })} className={inputClass}><option value="">Unassigned</option>{profiles.filter((item) => ["super_admin", "admin", "sales"].includes(item.role)).map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}</select></Field>
    </div>{canEdit && <div className="mt-5 flex justify-end"><button disabled={isSaving || !customer.name.trim()} onClick={() => void saveCustomerMaster()} className={primaryButtonClass}>{isSaving ? "Saving..." : "Save General"}</button></div>}</Section>}

    {activeTab === "Contacts" && <Section title="Contacts" description="People associated with this customer account."><div className="grid gap-3 lg:grid-cols-2">{contacts.map((contact) => <Card key={contact.id}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-800 dark:text-white/90">{contact.first_name} {contact.last_name}</h3>{contact.is_primary && <Badge>Primary</Badge>}</div><p className="mt-1 text-sm text-gray-500">{[contact.job_title, contact.department].filter(Boolean).join(" • ") || "No role"}</p><p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{contact.email || "—"}</p><p className="text-sm text-gray-500">{contact.mobile || contact.phone || "—"}</p><div className="mt-3 flex flex-wrap gap-1">{contact.is_billing_contact && <Badge>Billing</Badge>}{contact.is_shipping_contact && <Badge>Shipping</Badge>}{contact.is_order_contact && <Badge>Orders</Badge>}</div></div>{canEdit && <button onClick={() => void removeContact(contact.id)} className={dangerButtonClass}>Remove</button>}</div></Card>)}</div>{canEdit && <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]"><h3 className="mb-4 text-sm font-semibold text-gray-800 dark:text-white/90">Add Contact</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{(["first_name", "last_name", "job_title", "department", "email", "phone", "mobile"] as const).map((key) => <Field key={key} label={titleCase(key)}><input value={contactForm[key]} onChange={(e) => setContactForm({ ...contactForm, [key]: e.target.value })} className={inputClass} /></Field>)}</div><div className="mt-4 flex flex-wrap gap-4"><Check label="Primary" checked={contactForm.is_primary} onChange={(v) => setContactForm({ ...contactForm, is_primary: v })} /><Check label="Billing" checked={contactForm.is_billing_contact} onChange={(v) => setContactForm({ ...contactForm, is_billing_contact: v })} /><Check label="Shipping" checked={contactForm.is_shipping_contact} onChange={(v) => setContactForm({ ...contactForm, is_shipping_contact: v })} /><Check label="Orders" checked={contactForm.is_order_contact} onChange={(v) => setContactForm({ ...contactForm, is_order_contact: v })} /></div><div className="mt-4 flex justify-end"><button onClick={() => void addContact()} disabled={isSaving} className={primaryButtonClass}>Add Contact</button></div></div>}</Section>}

    {activeTab === "Pricing" && <Section title="Pricing" description="Customer-specific price group assignment."><div className="grid gap-4 md:grid-cols-2"><Field label="Default Price Group"><select value={customer.price_group_id ?? ""} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, price_group_id: e.target.value || null })} className={inputClass}><option value="">No price group</option>{priceGroups.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_base_price ? " (Base)" : ""}{item.requires_approval ? " · Approval" : ""}</option>)}</select></Field><Field label="Currency"><input value={customer.currency_code} disabled={!canEdit} onChange={(e) => setCustomer({ ...customer, currency_code: e.target.value.toUpperCase() })} className={inputClass} /></Field></div><div className="mt-4 rounded-xl border border-brand-100 bg-brand-25 p-4 text-sm text-gray-600 dark:border-brand-500/20 dark:bg-brand-500/[0.06] dark:text-gray-300">Store pricing resolves from the assigned order-eligible price group. For Sales users, changing the default price group is submitted to Admin approval; internal Cost pricing cannot be assigned.</div>{canEdit && <div className="mt-5 flex justify-end"><button onClick={() => void savePricing()} disabled={isSaving} className={primaryButtonClass}>{isSaving ? "Saving..." : "Save Pricing"}</button></div>}</Section>}

    {activeTab === "Addresses" && <Section title="Billing & Shipping Addresses" description="Multiple operational addresses with billing and shipping defaults."><div className="grid gap-3 lg:grid-cols-2">{addresses.map((address) => <Card key={address.id}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-800 dark:text-white/90">{address.address_name}</h3><Badge>{titleCase(address.address_type)}</Badge>{address.is_default_billing && <Badge>Default Billing</Badge>}{address.is_default_shipping && <Badge>Default Shipping</Badge>}</div><p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{address.address_line_1}{address.address_line_2 ? `, ${address.address_line_2}` : ""}</p><p className="text-sm text-gray-500">{[address.postal_code, address.city, address.state_region, address.country_code].filter(Boolean).join(", ")}</p><p className="mt-2 text-xs text-gray-400">{address.contact_name || address.phone || ""}</p></div>{canEdit && <button onClick={() => void removeAddress(address.id)} className={dangerButtonClass}>Remove</button>}</div></Card>)}</div>{canEdit && <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]"><h3 className="mb-4 text-sm font-semibold text-gray-800 dark:text-white/90">Add Address</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{(["address_name", "company_name", "contact_name", "address_line_1", "address_line_2", "postal_code", "city", "state_region", "country_code", "phone"] as const).map((key) => <Field key={key} label={titleCase(key)}><input value={addressForm[key]} maxLength={key === "country_code" ? 2 : undefined} onChange={(e) => setAddressForm({ ...addressForm, [key]: key === "country_code" ? e.target.value.toUpperCase() : e.target.value })} className={inputClass} /></Field>)}<Field label="Address Type"><select value={addressForm.address_type} onChange={(e) => setAddressForm({ ...addressForm, address_type: e.target.value as "billing" | "shipping" | "both" })} className={inputClass}><option value="billing">Billing</option><option value="shipping">Shipping</option><option value="both">Both</option></select></Field></div><div className="mt-4 flex gap-4"><Check label="Default Billing" checked={addressForm.is_default_billing} onChange={(v) => setAddressForm({ ...addressForm, is_default_billing: v })} /><Check label="Default Shipping" checked={addressForm.is_default_shipping} onChange={(v) => setAddressForm({ ...addressForm, is_default_shipping: v })} /></div><div className="mt-4 flex justify-end"><button onClick={() => void addAddress()} disabled={isSaving} className={primaryButtonClass}>Add Address</button></div></div>}</Section>}

    {activeTab === "Commercial" && commercial && <Section title="Commercial" description="Payment terms, limits and order controls. Protected changes made by Sales require Admin approval."><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Field label="Payment Terms"><select value={commercial.payment_term_id ?? ""} disabled={!canEdit} onChange={(e) => setCommercial({ ...commercial, payment_term_id: e.target.value || null })} className={inputClass}><option value="">None</option>{paymentTerms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Credit Limit"><input type="number" min="0" step="0.01" value={commercial.credit_limit ?? ""} disabled={!canEdit} onChange={(e) => setCommercial({ ...commercial, credit_limit: e.target.value || null })} className={inputClass} /></Field><Field label="Minimum Order"><input type="number" min="0" step="0.01" value={commercial.minimum_order_amount ?? ""} disabled={!canEdit} onChange={(e) => setCommercial({ ...commercial, minimum_order_amount: e.target.value || null })} className={inputClass} /></Field><Field label="Tax Exemption Number"><input value={commercial.tax_exemption_number ?? ""} disabled={!canEdit} onChange={(e) => setCommercial({ ...commercial, tax_exemption_number: e.target.value || null })} className={inputClass} /></Field><Field label="Credit Hold Reason"><input value={commercial.credit_hold_reason ?? ""} disabled={!canEdit} onChange={(e) => setCommercial({ ...commercial, credit_hold_reason: e.target.value || null })} className={inputClass} /></Field></div><div className="mt-4 flex gap-5"><Check label="Tax Exempt" checked={commercial.tax_exempt} disabled={!canEdit} onChange={(v) => setCommercial({ ...commercial, tax_exempt: v })} /><Check label="Credit Hold" checked={commercial.credit_hold} disabled={!canEdit} onChange={(v) => setCommercial({ ...commercial, credit_hold: v })} /></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Discount Notes"><textarea value={commercial.discount_notes ?? ""} disabled={!canEdit} onChange={(e) => setCommercial({ ...commercial, discount_notes: e.target.value || null })} className={textareaClass} /></Field><Field label="Order Notes"><textarea value={commercial.order_notes ?? ""} disabled={!canEdit} onChange={(e) => setCommercial({ ...commercial, order_notes: e.target.value || null })} className={textareaClass} /></Field></div>{canEdit && <div className="mt-5 flex justify-end"><button onClick={() => void saveCommercial()} disabled={isSaving} className={primaryButtonClass}>{isSaving ? "Saving..." : "Save Commercial"}</button></div>}</Section>}

    {activeTab === "Web / Portal" && <Section title="Web / Portal" description="Portal access and users for the customer company."><div className="mb-5 flex items-center justify-between rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div><p className="font-medium text-gray-800 dark:text-white/90">Customer Portal Access</p><p className="mt-1 text-sm text-gray-500">Controls whether this customer can use Modulex Store portal features.</p></div>{canManagePortal ? <button onClick={() => void saveCustomer({ portal_enabled: !customer.portal_enabled }, customer.portal_enabled ? "Customer portal disabled" : "Customer portal enabled")} className={customer.portal_enabled ? dangerButtonClass : primaryButtonClass}>{customer.portal_enabled ? "Disable Portal" : "Enable Portal"}</button> : <Badge>{customer.portal_enabled ? "Enabled" : "Disabled"}</Badge>}</div><div className="grid gap-3 lg:grid-cols-2">{portalUsers.map((user) => <Card key={user.id}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-800 dark:text-white/90">{user.full_name || user.login_email}</h3>{user.is_primary && <Badge>Primary</Badge>}</div><p className="mt-1 text-sm text-gray-500">{user.login_email}</p><div className="mt-3 flex gap-2"><Badge>{titleCase(user.portal_role)}</Badge><Badge>{titleCase(user.status)}</Badge></div><p className="mt-3 text-xs text-gray-400">Last login: {dateTime(user.last_login_at)}</p></div>{canManagePortal && <button onClick={() => void removePortalUser(user.id)} className={dangerButtonClass}>Remove</button>}</div></Card>)}</div>{canManagePortal && <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]"><h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white/90">Add Portal User</h3><p className="mb-4 text-xs text-gray-500">This creates portal metadata only. Auth invitation will be wired through a secure server action after integration testing.</p><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Full Name"><input value={portalForm.full_name} onChange={(e) => setPortalForm({ ...portalForm, full_name: e.target.value })} className={inputClass} /></Field><Field label="Login Email"><input type="email" value={portalForm.login_email} onChange={(e) => setPortalForm({ ...portalForm, login_email: e.target.value })} className={inputClass} /></Field><Field label="Role"><select value={portalForm.portal_role} onChange={(e) => setPortalForm({ ...portalForm, portal_role: e.target.value as "admin" | "buyer" | "viewer" })} className={inputClass}><option value="admin">Admin</option><option value="buyer">Buyer</option><option value="viewer">Viewer</option></select></Field><Field label="Status"><select value={portalForm.status} onChange={(e) => setPortalForm({ ...portalForm, status: e.target.value as typeof portalForm.status })} className={inputClass}><option value="never_invited">Never Invited</option><option value="invited">Invited</option><option value="active">Active</option><option value="suspended">Suspended</option></select></Field></div><div className="mt-4"><Check label="Primary Portal User" checked={portalForm.is_primary} onChange={(v) => setPortalForm({ ...portalForm, is_primary: v })} /></div><div className="mt-4 flex justify-end"><button onClick={() => void addPortalUser()} disabled={isSaving} className={primaryButtonClass}>Add Portal User</button></div></div>}</Section>}

    {activeTab === "Notes & Documents" && <Section title="Notes & Documents" description="Internal customer notes and document metadata."><div className="grid gap-6 xl:grid-cols-2"><div><h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Notes</h3><div className="space-y-3">{notes.map((note) => <Card key={note.id}><div className="flex items-start justify-between gap-3"><div>{note.is_pinned && <Badge>Pinned</Badge>}<p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{note.note}</p><p className="mt-2 text-xs text-gray-400">{note.category || "General"} • {dateTime(note.created_at)}</p></div>{canEdit && <button onClick={() => void removeNote(note.id)} className={dangerButtonClass}>Remove</button>}</div></Card>)}</div>{canEdit && <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]"><Field label="New Note"><textarea value={noteForm.note} onChange={(e) => setNoteForm({ ...noteForm, note: e.target.value })} className={textareaClass} /></Field><div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Category"><input value={noteForm.category} onChange={(e) => setNoteForm({ ...noteForm, category: e.target.value })} className={inputClass} /></Field><div className="flex items-end pb-2"><Check label="Pin note" checked={noteForm.is_pinned} onChange={(v) => setNoteForm({ ...noteForm, is_pinned: v })} /></div></div><div className="mt-3 flex justify-end"><button onClick={() => void addNote()} className={primaryButtonClass}>Add Note</button></div></div>}</div><div><h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Documents</h3><div className="space-y-3">{documents.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700">No documents uploaded yet.</div> : documents.map((document) => <Card key={document.id}><p className="font-medium text-gray-800 dark:text-white/90">{document.file_name}</p><p className="mt-1 text-xs text-gray-500">{document.document_type || "Document"} • {dateTime(document.created_at)}</p><p className="mt-2 break-all text-xs text-gray-400">{document.storage_path}</p></Card>)}</div><div className="mt-4 rounded-xl border border-brand-100 bg-brand-25 p-4 text-xs leading-5 text-gray-600 dark:border-brand-500/20 dark:bg-brand-500/[0.06] dark:text-gray-300">Document metadata is ready. File upload will be connected after the <strong>customer-documents</strong> Supabase Storage bucket and its policies are confirmed during integration testing.</div></div></div></Section>}

    {activeTab === "Activity" && <Section title="Activity" description="Append-only customer activity timeline."><div className="space-y-3">{activities.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">No activity yet.</p> : activities.map((activity) => <div key={activity.id} className="relative rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-medium text-gray-800 dark:text-white/90">{activity.title}</p>{activity.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{activity.description}</p>}<p className="mt-2 text-xs text-gray-400">{titleCase(activity.activity_type)}{activity.actor_user_id ? ` • ${profileMap.get(activity.actor_user_id) ?? "User"}` : ""}</p></div><span className="text-xs text-gray-400">{dateTime(activity.created_at)}</span></div></div>)}</div></Section>}
  </div>;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6"><div className="mb-5"><h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p></div>{children}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>{children}</div>; }
function Card({ children }: { children: React.ReactNode }) { return <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.02]">{children}</div>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{children}</span>; }
function Check({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) { return <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand-500" />{label}</label>; }
