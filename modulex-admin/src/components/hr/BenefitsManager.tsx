"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";

type Employee = { id: string; employee_number: string; first_name: string; last_name: string };
type Plan = { id: string; code: string; name: string; benefit_type: string; provider: string | null; employee_cost: number; employer_cost: number; tax_treatment: string; is_active: boolean };
type Enrollment = { id: string; employee_id: string; benefit_plan_id: string; coverage_level: string | null; employee_cost_override: number | null; employer_cost_override: number | null; effective_from: string; effective_to: string | null; status: string };
type Notice = { variant: "success" | "error"; title: string; message: string };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const benefitTypes = ["health", "dental", "vision", "retirement", "life", "disability", "other"];

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

export default function BenefitsManager() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"plan" | "enroll" | string | null>(null);
  const [endCandidateId, setEndCandidateId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("health");
  const [provider, setProvider] = useState("");
  const [employeeCost, setEmployeeCost] = useState("0");
  const [employerCost, setEmployerCost] = useState("0");
  const [tax, setTax] = useState("pre_tax");
  const [planId, setPlanId] = useState("");
  const [coverage, setCoverage] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));

  function fail(title: string, message: string, error: unknown) {
    console.error(title, error);
    setNotice({ variant: "error", title, message });
  }

  async function load() {
    setLoading(true);
    try {
      const [e, p, b] = await Promise.all([
        supabase.from("hr_employees").select("id,employee_number,first_name,last_name").in("employment_status", ["active", "on_leave"]).order("last_name"),
        supabase.from("hr_benefit_plans").select("id,code,name,benefit_type,provider,employee_cost,employer_cost,tax_treatment,is_active").order("name"),
        supabase.from("hr_employee_benefits").select("id,employee_id,benefit_plan_id,coverage_level,employee_cost_override,employer_cost_override,effective_from,effective_to,status").order("effective_from", { ascending: false }),
      ]);
      for (const result of [e, p, b]) if (result.error) throw result.error;
      const nextEmployees = (e.data ?? []) as Employee[];
      const nextPlans = (p.data ?? []) as Plan[];
      setEmployees(nextEmployees);
      setPlans(nextPlans);
      setEnrollments((b.data ?? []) as Enrollment[]);
      if (!employeeId && nextEmployees[0]) setEmployeeId(nextEmployees[0].id);
      if (!planId) {
        const firstActive = nextPlans.find((plan) => plan.is_active);
        if (firstActive) setPlanId(firstActive.id);
      }
    } catch (error) {
      fail("Benefits unavailable", "Benefit plans and enrollments could not be loaded. Please try again.", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function createPlan(event: FormEvent) {
    event.preventDefault(); setBusy("plan"); setNotice(null);
    const { error } = await supabase.from("hr_benefit_plans").insert({ code: code.trim().toUpperCase(), name: name.trim(), benefit_type: type, provider: provider.trim() || null, employee_cost: Number(employeeCost), employer_cost: Number(employerCost), tax_treatment: tax });
    if (error) fail("Plan not created", "The benefit plan could not be created. Check the form and try again.", error);
    else { setCode(""); setName(""); setProvider(""); setEmployeeCost("0"); setEmployerCost("0"); setNotice({ variant: "success", title: "Plan created", message: "The benefit plan is ready for enrollment." }); await load(); }
    setBusy(null);
  }

  async function enroll(event: FormEvent) {
    event.preventDefault(); setBusy("enroll"); setNotice(null);
    const { error } = await supabase.from("hr_employee_benefits").insert({ employee_id: employeeId, benefit_plan_id: planId, coverage_level: coverage.trim() || null, effective_from: effectiveFrom, status: "active" });
    if (error) fail("Enrollment not created", "The employee could not be enrolled. Please try again.", error);
    else { setCoverage(""); setNotice({ variant: "success", title: "Employee enrolled", message: "The benefit enrollment is active." }); await load(); }
    setBusy(null);
  }

  async function endEnrollment(id: string) {
    setBusy(id); setNotice(null);
    const { error } = await supabase.from("hr_employee_benefits").update({ status: "ended", effective_to: new Date().toISOString().slice(0, 10) }).eq("id", id);
    if (error) fail("Enrollment not ended", "The enrollment could not be ended. Please try again.", error);
    else { setEndCandidateId(null); setNotice({ variant: "success", title: "Enrollment ended", message: "The enrollment end date was recorded." }); await load(); }
    setBusy(null);
  }

  const employeeOptions = employees.map((employee) => ({ value: employee.id, label: `${employee.employee_number} · ${employee.first_name} ${employee.last_name}` }));
  const planOptions = plans.filter((plan) => plan.is_active).map((plan) => ({ value: plan.id, label: plan.name }));
  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.id, `${employee.employee_number} · ${employee.first_name} ${employee.last_name}`])), [employees]);
  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  return (
    <div className="space-y-6">
      {notice ? <Alert variant={notice.variant} title={notice.title} message={notice.message} /> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={createPlan} aria-busy={busy === "plan"}><ComponentCard title="New Benefit Plan" desc="Create health, retirement and other employee benefit plans.">
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="benefit-code">Code</Label><Input id="benefit-code" value={code} onChange={(event) => setCode(event.target.value)} required /></div><div><Label htmlFor="benefit-name">Plan name</Label><Input id="benefit-name" value={name} onChange={(event) => setName(event.target.value)} required /></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="benefit-type">Type</Label><Select id="benefit-type" options={benefitTypes.map((item) => ({ value: item, label: labelize(item) }))} value={type} onChange={setType} /></div><div><Label htmlFor="benefit-provider">Provider</Label><Input id="benefit-provider" value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="Optional provider" /></div></div>
          <div className="grid gap-4 sm:grid-cols-3"><div><Label htmlFor="benefit-employee-cost">Employee cost</Label><Input id="benefit-employee-cost" type="number" min="0" step="0.01" value={employeeCost} onChange={(event) => setEmployeeCost(event.target.value)} /></div><div><Label htmlFor="benefit-employer-cost">Employer cost</Label><Input id="benefit-employer-cost" type="number" min="0" step="0.01" value={employerCost} onChange={(event) => setEmployerCost(event.target.value)} /></div><div><Label htmlFor="benefit-tax">Tax treatment</Label><Select id="benefit-tax" options={[{ value: "pre_tax", label: "Pre-tax" }, { value: "post_tax", label: "Post-tax" }, { value: "non_taxable", label: "Non-taxable" }]} value={tax} onChange={setTax} /></div></div>
          <Button type="submit" disabled={busy !== null}>{busy === "plan" ? "Creating…" : "Create Plan"}</Button>
        </ComponentCard></form>

        <form onSubmit={enroll} aria-busy={busy === "enroll"}><ComponentCard title="Enroll Employee" desc="Attach an active benefit plan to an employee.">
          <div><Label htmlFor="benefit-employee">Employee</Label><Select id="benefit-employee" options={employeeOptions} value={employeeId} onChange={setEmployeeId} required placeholder="Select employee" /></div>
          <div><Label htmlFor="benefit-plan">Plan</Label><Select id="benefit-plan" options={planOptions} value={planId} onChange={setPlanId} required placeholder="Select active plan" /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="benefit-coverage">Coverage level</Label><Input id="benefit-coverage" value={coverage} onChange={(event) => setCoverage(event.target.value)} placeholder="Employee, family…" /></div><div><Label htmlFor="benefit-effective">Effective date</Label><Input id="benefit-effective" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></div></div>
          <Button type="submit" disabled={busy !== null || !employeeId || !planId}>{busy === "enroll" ? "Enrolling…" : "Enroll"}</Button>
        </ComponentCard></form>
      </div>

      <ComponentCard title="Benefit Plans" desc="Configured employee and employer contribution amounts.">
        <TableViewport><Table variant="admin" minWidth="wide"><TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Plan</TableCell><TableCell isHeader variant="admin">Type</TableCell><TableCell isHeader variant="admin">Provider</TableCell><TableCell isHeader variant="admin" className="text-right">Employee</TableCell><TableCell isHeader variant="admin" className="text-right">Employer</TableCell><TableCell isHeader variant="admin">Tax</TableCell><TableCell isHeader variant="admin">Status</TableCell></TableRow></TableHeader><TableBody variant="admin" aria-busy={loading}>
          {loading ? <TableStateRow colSpan={7}>Loading benefit plans…</TableStateRow> : plans.length === 0 ? <TableStateRow colSpan={7}>No benefit plans configured.</TableStateRow> : plans.map((plan) => <TableRow key={plan.id}><TableCell variant="admin"><span className={ADMIN_TEXT_STYLES.strong}>{plan.code} · {plan.name}</span></TableCell><TableCell variant="admin">{labelize(plan.benefit_type)}</TableCell><TableCell variant="admin">{plan.provider || "—"}</TableCell><TableCell variant="admin" className="text-right tabular-nums">{money.format(Number(plan.employee_cost))}</TableCell><TableCell variant="admin" className="text-right tabular-nums">{money.format(Number(plan.employer_cost))}</TableCell><TableCell variant="admin">{labelize(plan.tax_treatment)}</TableCell><TableCell variant="admin"><Badge color={plan.is_active ? "success" : "light"}>{plan.is_active ? "Active" : "Inactive"}</Badge></TableCell></TableRow>)}
        </TableBody></Table></TableViewport>
      </ComponentCard>

      <ComponentCard title="Enrollments" desc="Employee benefit coverage and effective periods.">
        <TableViewport><Table variant="admin" minWidth="extraWide"><TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Employee</TableCell><TableCell isHeader variant="admin">Plan</TableCell><TableCell isHeader variant="admin">Coverage</TableCell><TableCell isHeader variant="admin">Effective</TableCell><TableCell isHeader variant="admin">Status</TableCell><TableCell isHeader variant="admin">Actions</TableCell></TableRow></TableHeader><TableBody variant="admin" aria-busy={loading}>
          {loading ? <TableStateRow colSpan={6}>Loading enrollments…</TableStateRow> : enrollments.length === 0 ? <TableStateRow colSpan={6}>No benefit enrollments yet.</TableStateRow> : enrollments.map((row) => <TableRow key={row.id}><TableCell variant="admin">{employeeMap.get(row.employee_id) || "Unknown employee"}</TableCell><TableCell variant="admin">{planMap.get(row.benefit_plan_id)?.name || "Unknown plan"}</TableCell><TableCell variant="admin">{row.coverage_level || "—"}</TableCell><TableCell variant="admin" className="whitespace-nowrap">{formatDate(row.effective_from)}{row.effective_to ? ` → ${formatDate(row.effective_to)}` : ""}</TableCell><TableCell variant="admin"><Badge color={row.status === "active" ? "success" : "light"}>{labelize(row.status)}</Badge></TableCell><TableCell variant="admin">{row.status === "active" ? endCandidateId === row.id ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setEndCandidateId(null)} disabled={busy === row.id}>Cancel</Button><Button size="sm" onClick={() => void endEnrollment(row.id)} disabled={busy === row.id}>{busy === row.id ? "Ending…" : "Confirm end"}</Button></div> : <Button size="sm" variant="outline" onClick={() => setEndCandidateId(row.id)} disabled={busy !== null}>End Enrollment</Button> : null}</TableCell></TableRow>)}
        </TableBody></Table></TableViewport>
      </ComponentCard>
    </div>
  );
}
