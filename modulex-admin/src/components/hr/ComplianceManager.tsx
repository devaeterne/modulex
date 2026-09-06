"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";

type Employee = { id: string; employee_number: string; first_name: string; last_name: string };
type TaxProfile = { id: string; employee_id: string; federal_filing_status: string | null; federal_multiple_jobs: boolean; federal_dependents_credit: number; federal_other_income: number; federal_deductions: number; federal_extra_withholding: number; state_code: string | null; state_filing_status: string | null; state_extra_withholding: number; local_jurisdiction: string | null; local_extra_withholding: number; tax_exempt_federal: boolean; tax_exempt_state: boolean; tax_exempt_local: boolean; w4_on_file: boolean; i9_verified: boolean; i9_verified_at: string | null; work_authorization_expires_on: string | null; tax_identifier_last4: string | null; notes: string | null };
type Contact = { id: string; employee_id: string; full_name: string; relationship: string | null; phone: string; email: string | null; is_primary: boolean; notes: string | null };
type Notice = { variant: "success" | "error" | "info"; title: string; message: string };

export default function ComplianceManager() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [profile, setProfile] = useState<TaxProfile | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [federalStatus, setFederalStatus] = useState("");
  const [multipleJobs, setMultipleJobs] = useState(false);
  const [dependents, setDependents] = useState("0");
  const [otherIncome, setOtherIncome] = useState("0");
  const [deductions, setDeductions] = useState("0");
  const [federalExtra, setFederalExtra] = useState("0");
  const [stateCode, setStateCode] = useState("");
  const [stateStatus, setStateStatus] = useState("");
  const [stateExtra, setStateExtra] = useState("0");
  const [local, setLocal] = useState("");
  const [localExtra, setLocalExtra] = useState("0");
  const [w4, setW4] = useState(false);
  const [i9, setI9] = useState(false);
  const [workAuth, setWorkAuth] = useState("");
  const [last4, setLast4] = useState("");
  const [taxNotes, setTaxNotes] = useState("");
  const [contactName, setContactName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [primary, setPrimary] = useState(false);

  function fail(title: string, message: string, error: unknown) { console.error(title, error); setNotice({ variant: "error", title, message }); }

  async function loadEmployees() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("hr_employees").select("id,employee_number,first_name,last_name").order("last_name");
      if (error) throw error;
      const nextEmployees = (data ?? []) as Employee[];
      setEmployees(nextEmployees);
      if (!employeeId && nextEmployees[0]) setEmployeeId(nextEmployees[0].id);
    } catch (error) { fail("Employees unavailable", "Employees could not be loaded for compliance review. Please try again.", error); }
    finally { setLoading(false); }
  }

  async function loadEmployee(id: string) {
    if (!id) { setProfile(null); setContacts([]); return; }
    setLoadingEmployee(true); setDeleteCandidateId(null);
    try {
      const [p, c] = await Promise.all([
        supabase.from("hr_tax_profiles").select("*").eq("employee_id", id).maybeSingle(),
        supabase.from("hr_emergency_contacts").select("id,employee_id,full_name,relationship,phone,email,is_primary,notes").eq("employee_id", id).order("is_primary", { ascending: false }),
      ]);
      if (p.error) throw p.error; if (c.error) throw c.error;
      const row = (p.data as TaxProfile | null) ?? null;
      setProfile(row); setContacts((c.data ?? []) as Contact[]);
      setFederalStatus(row?.federal_filing_status ?? ""); setMultipleJobs(row?.federal_multiple_jobs ?? false); setDependents(String(row?.federal_dependents_credit ?? 0)); setOtherIncome(String(row?.federal_other_income ?? 0)); setDeductions(String(row?.federal_deductions ?? 0)); setFederalExtra(String(row?.federal_extra_withholding ?? 0)); setStateCode(row?.state_code ?? ""); setStateStatus(row?.state_filing_status ?? ""); setStateExtra(String(row?.state_extra_withholding ?? 0)); setLocal(row?.local_jurisdiction ?? ""); setLocalExtra(String(row?.local_extra_withholding ?? 0)); setW4(row?.w4_on_file ?? false); setI9(row?.i9_verified ?? false); setWorkAuth(row?.work_authorization_expires_on ?? ""); setLast4(row?.tax_identifier_last4 ?? ""); setTaxNotes(row?.notes ?? "");
    } catch (error) { fail("Compliance data unavailable", "The selected employee compliance profile could not be loaded. Please try again.", error); }
    finally { setLoadingEmployee(false); }
  }

  useEffect(() => { void loadEmployees(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { void loadEmployee(employeeId); }, [employeeId]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (!employeeId) return; setBusy("profile"); setNotice(null);
    const payload = { employee_id: employeeId, federal_filing_status: federalStatus.trim() || null, federal_multiple_jobs: multipleJobs, federal_dependents_credit: Number(dependents || 0), federal_other_income: Number(otherIncome || 0), federal_deductions: Number(deductions || 0), federal_extra_withholding: Number(federalExtra || 0), state_code: stateCode.trim().toUpperCase() || null, state_filing_status: stateStatus.trim() || null, state_extra_withholding: Number(stateExtra || 0), local_jurisdiction: local.trim() || null, local_extra_withholding: Number(localExtra || 0), w4_on_file: w4, i9_verified: i9, i9_verified_at: i9 ? (profile?.i9_verified_at || new Date().toISOString()) : null, work_authorization_expires_on: workAuth || null, tax_identifier_last4: last4.trim() || null, notes: taxNotes.trim() || null };
    const { error } = await supabase.from("hr_tax_profiles").upsert(payload, { onConflict: "employee_id" });
    if (error) fail("Compliance profile not saved", "The tax and compliance profile could not be saved. Please try again.", error);
    else { setNotice({ variant: "success", title: "Compliance profile saved", message: "The employee tax and compliance elections were updated." }); await loadEmployee(employeeId); }
    setBusy(null);
  }

  async function addContact(event: FormEvent) {
    event.preventDefault(); if (!employeeId) return; setBusy("contact"); setNotice(null);
    if (primary) {
      const primaryResult = await supabase.from("hr_emergency_contacts").update({ is_primary: false }).eq("employee_id", employeeId);
      if (primaryResult.error) { fail("Primary contact not updated", "The existing primary contact could not be changed. No new contact was added.", primaryResult.error); setBusy(null); return; }
    }
    const { error } = await supabase.from("hr_emergency_contacts").insert({ employee_id: employeeId, full_name: contactName.trim(), relationship: relationship.trim() || null, phone: phone.trim(), email: email.trim() || null, is_primary: primary });
    if (error) fail("Emergency contact not added", "The emergency contact could not be added. Please try again.", error);
    else { setContactName(""); setRelationship(""); setPhone(""); setEmail(""); setPrimary(false); setNotice({ variant: "success", title: "Emergency contact added", message: "The contact is now available on the employee profile." }); await loadEmployee(employeeId); }
    setBusy(null);
  }

  async function removeContact(id: string) {
    setBusy(id); setNotice(null);
    const { error } = await supabase.from("hr_emergency_contacts").delete().eq("id", id);
    if (error) fail("Emergency contact not deleted", "The emergency contact could not be removed. Please try again.", error);
    else { setDeleteCandidateId(null); setNotice({ variant: "success", title: "Emergency contact deleted", message: "The contact was removed." }); await loadEmployee(employeeId); }
    setBusy(null);
  }

  const employeeOptions = employees.map((employee) => ({ value: employee.id, label: `${employee.employee_number} · ${employee.first_name} ${employee.last_name}` }));
  const selected = useMemo(() => employees.find((employee) => employee.id === employeeId), [employees, employeeId]);

  return <div className="space-y-6">
    {notice ? <Alert variant={notice.variant} title={notice.title} message={notice.message} /> : null}
    <ComponentCard title="Employee compliance profile" desc="Select the employee whose withholding, I-9/W-4 and emergency-contact information you need to manage.">
      <div className="max-w-xl"><Label htmlFor="compliance-employee">Employee</Label><Select id="compliance-employee" options={employeeOptions} value={employeeId} onChange={setEmployeeId} placeholder="Select employee" disabled={loading} /></div>
      {selected ? <p className={`${ADMIN_TEXT_STYLES.muted} text-xs`}>Sensitive HR profile for {selected.first_name} {selected.last_name}. Full SSN is not stored in this module.</p> : null}
    </ComponentCard>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]" aria-busy={loadingEmployee}>
      <form onSubmit={saveProfile}><ComponentCard title="US Payroll / Compliance Profile" desc="Employee elections and compliance flags. Tax calculation rules are managed separately by tax year and jurisdiction.">
        {loadingEmployee ? <p className={`${ADMIN_TEXT_STYLES.muted} text-sm`}>Loading compliance profile…</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label htmlFor="compliance-federal-status">Federal filing status</Label><Input id="compliance-federal-status" value={federalStatus} onChange={(event) => setFederalStatus(event.target.value)} disabled={loadingEmployee || busy !== null} /></div>
          <div className="flex items-end pb-2"><Checkbox id="compliance-multiple-jobs" label="W-4 multiple jobs" checked={multipleJobs} onChange={setMultipleJobs} disabled={loadingEmployee || busy !== null} /></div>
          <div><Label htmlFor="compliance-dependents">Dependents credit</Label><Input id="compliance-dependents" type="number" min="0" step="0.01" value={dependents} onChange={(event) => setDependents(event.target.value)} /></div>
          <div><Label htmlFor="compliance-other-income">Other income</Label><Input id="compliance-other-income" type="number" min="0" step="0.01" value={otherIncome} onChange={(event) => setOtherIncome(event.target.value)} /></div>
          <div><Label htmlFor="compliance-deductions">Deductions</Label><Input id="compliance-deductions" type="number" min="0" step="0.01" value={deductions} onChange={(event) => setDeductions(event.target.value)} /></div>
          <div><Label htmlFor="compliance-federal-extra">Federal extra withholding</Label><Input id="compliance-federal-extra" type="number" min="0" step="0.01" value={federalExtra} onChange={(event) => setFederalExtra(event.target.value)} /></div>
          <div><Label htmlFor="compliance-state-code">State code</Label><Input id="compliance-state-code" maxLength={2} value={stateCode} onChange={(event) => setStateCode(event.target.value)} placeholder="VA" /></div>
          <div><Label htmlFor="compliance-state-status">State filing status</Label><Input id="compliance-state-status" value={stateStatus} onChange={(event) => setStateStatus(event.target.value)} /></div>
          <div><Label htmlFor="compliance-state-extra">State extra withholding</Label><Input id="compliance-state-extra" type="number" min="0" step="0.01" value={stateExtra} onChange={(event) => setStateExtra(event.target.value)} /></div>
          <div><Label htmlFor="compliance-local">Local jurisdiction</Label><Input id="compliance-local" value={local} onChange={(event) => setLocal(event.target.value)} /></div>
          <div><Label htmlFor="compliance-local-extra">Local extra withholding</Label><Input id="compliance-local-extra" type="number" min="0" step="0.01" value={localExtra} onChange={(event) => setLocalExtra(event.target.value)} /></div>
          <div><Label htmlFor="compliance-last4">Tax ID last 4 only</Label><Input id="compliance-last4" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
          <div><Label htmlFor="compliance-work-auth">Work authorization expires</Label><Input id="compliance-work-auth" type="date" value={workAuth} onChange={(event) => setWorkAuth(event.target.value)} /></div>
          <div className="flex flex-wrap items-end gap-5 pb-2"><Checkbox id="compliance-w4" label="W-4 on file" checked={w4} onChange={setW4} /><Checkbox id="compliance-i9" label="I-9 verified" checked={i9} onChange={setI9} /></div>
        </div>
        <div><Label htmlFor="compliance-notes">Compliance notes</Label><TextArea id="compliance-notes" rows={4} value={taxNotes} onChange={setTaxNotes} /></div>
        <Button type="submit" disabled={!employeeId || loadingEmployee || busy !== null}>{busy === "profile" ? "Saving…" : "Save Compliance Profile"}</Button>
      </ComponentCard></form>

      <div className="space-y-6">
        <form onSubmit={addContact}><ComponentCard title="Emergency Contact" desc="Add a contact for the selected employee.">
          <div><Label htmlFor="contact-name">Full name</Label><Input id="contact-name" value={contactName} onChange={(event) => setContactName(event.target.value)} required /></div>
          <div><Label htmlFor="contact-relationship">Relationship</Label><Input id="contact-relationship" value={relationship} onChange={(event) => setRelationship(event.target.value)} /></div>
          <div><Label htmlFor="contact-phone">Phone</Label><Input id="contact-phone" value={phone} onChange={(event) => setPhone(event.target.value)} required /></div>
          <div><Label htmlFor="contact-email">Email</Label><Input id="contact-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <Checkbox id="contact-primary" label="Primary contact" checked={primary} onChange={setPrimary} />
          <Button type="submit" className="w-full" disabled={!employeeId || busy !== null}>{busy === "contact" ? "Adding…" : "Add Contact"}</Button>
        </ComponentCard></form>

        <ComponentCard title="Contacts" desc="Emergency contacts recorded for the selected employee.">
          <div className="space-y-3">
            {loadingEmployee ? <p className={`${ADMIN_TEXT_STYLES.muted} text-sm`}>Loading emergency contacts…</p> : contacts.length === 0 ? <p className={`${ADMIN_TEXT_STYLES.muted} text-sm`}>No emergency contacts.</p> : contacts.map((contact) => <article key={contact.id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong className={ADMIN_TEXT_STYLES.strong}>{contact.full_name}</strong>{contact.is_primary ? <Badge color="primary" size="sm">Primary</Badge> : null}</div><p className={`${ADMIN_TEXT_STYLES.muted} mt-1 text-xs`}>{contact.relationship || "Contact"} · {contact.phone}{contact.email ? ` · ${contact.email}` : ""}</p></div>{deleteCandidateId === contact.id ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setDeleteCandidateId(null)} disabled={busy === contact.id}>Cancel</Button><Button size="sm" onClick={() => void removeContact(contact.id)} disabled={busy === contact.id}>{busy === contact.id ? "Deleting…" : "Confirm delete"}</Button></div> : <Button size="sm" variant="outline" onClick={() => setDeleteCandidateId(contact.id)} disabled={busy !== null}>Delete</Button>}</div></article>)}
          </div>
        </ComponentCard>
      </div>
    </div>
  </div>;
}
