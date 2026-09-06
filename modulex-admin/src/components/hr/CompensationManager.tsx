"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import StatTile from "@/components/common/StatTile";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Switch from "@/components/form/switch/Switch";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableStateRow,
  TableViewport,
} from "@/components/ui/table";
import {
  ADMIN_TEXT_STYLES,
  type AdminStatusColor,
} from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

type Employee = {
  employee_id: string;
  employee_number: string;
  full_name: string;
  employment_status: string;
  employment_type: string;
  department_name: string | null;
  position_title: string | null;
};

type Compensation = {
  id: string;
  employee_id: string;
  pay_type: string;
  base_rate: number;
  currency_code: string;
  pay_frequency: string;
  standard_weekly_hours: number;
  overtime_eligible: boolean;
  overtime_multiplier: number;
  effective_from: string;
  effective_to: string | null;
  reason: string | null;
};

type VariablePay = {
  id: string;
  employee_id: string;
  pay_type: string;
  amount: number;
  earning_date: string;
  status: string;
  description: string | null;
};

type Advance = {
  id: string;
  employee_id: string;
  advance_date: string;
  amount: number;
  installment_amount: number | null;
  balance_remaining: number;
  status: string;
  reason: string | null;
};

type Deduction = {
  id: string;
  employee_id: string;
  name: string;
  deduction_type: string;
  tax_treatment: string;
  amount: number | null;
  percentage: number | null;
  frequency: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
};

type Feedback = {
  tone: "success" | "error";
  title: string;
  text: string;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const payTypeOptions = [
  { value: "salary", label: "Salary (annual)" },
  { value: "hourly", label: "Hourly" },
];

const payFrequencyOptions = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "semimonthly", label: "Semimonthly" },
  { value: "monthly", label: "Monthly" },
];

const variableTypeOptions = [
  { value: "bonus", label: "Bonus" },
  { value: "commission", label: "Commission" },
  { value: "incentive", label: "Incentive" },
  { value: "reimbursement", label: "Reimbursement" },
  { value: "other", label: "Other" },
];

const deductionTypeOptions = [
  { value: "fixed", label: "Fixed amount" },
  { value: "percent", label: "Percentage" },
];

const taxTreatmentOptions = [
  { value: "pre_tax", label: "Pre-tax" },
  { value: "post_tax", label: "Post-tax" },
];

const deductionFrequencyOptions = [
  { value: "recurring", label: "Recurring" },
  { value: "one_time", label: "One time" },
];

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value: string | null) {
  if (!value) return "—";
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

function readable(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusPresentation(value: string): {
  label: string;
  color: AdminStatusColor;
} {
  switch (value) {
    case "approved":
    case "paid":
    case "active":
    case "closed":
      return { label: readable(value), color: "success" };
    case "open":
    case "pending":
      return { label: readable(value), color: "warning" };
    case "void":
    case "inactive":
    case "disabled":
      return { label: readable(value), color: "light" };
    case "rejected":
    case "failed":
      return { label: readable(value), color: "error" };
    default:
      return { label: readable(value), color: "primary" };
  }
}

function clearEmployeeData(
  setCompensation: (rows: Compensation[]) => void,
  setVariablePay: (rows: VariablePay[]) => void,
  setAdvances: (rows: Advance[]) => void,
  setDeductions: (rows: Deduction[]) => void,
) {
  setCompensation([]);
  setVariablePay([]);
  setAdvances([]);
  setDeductions([]);
}

export default function CompensationManager() {
  const today = formatDateInput(new Date());
  const dataRequestRef = useRef(0);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [compensation, setCompensation] = useState<Compensation[]>([]);
  const [variablePay, setVariablePay] = useState<VariablePay[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [payType, setPayType] = useState("salary");
  const [baseRate, setBaseRate] = useState("");
  const [frequency, setFrequency] = useState("biweekly");
  const [weeklyHours, setWeeklyHours] = useState("40");
  const [overtimeEligible, setOvertimeEligible] = useState(false);
  const [otMultiplier, setOtMultiplier] = useState("1.5");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [compReason, setCompReason] = useState("");

  const [variableType, setVariableType] = useState("bonus");
  const [variableAmount, setVariableAmount] = useState("");
  const [earningDate, setEarningDate] = useState(today);
  const [variableDescription, setVariableDescription] = useState("");

  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceDate, setAdvanceDate] = useState(today);
  const [installment, setInstallment] = useState("");
  const [advanceReason, setAdvanceReason] = useState("");

  const [deductionName, setDeductionName] = useState("");
  const [deductionType, setDeductionType] = useState("fixed");
  const [taxTreatment, setTaxTreatment] = useState("post_tax");
  const [deductionValue, setDeductionValue] = useState("");
  const [deductionFrequency, setDeductionFrequency] = useState("recurring");
  const [deductionStart, setDeductionStart] = useState(today);

  async function loadEmployees() {
    setIsLoadingEmployees(true);
    try {
      const [{ profile }, { data, error }] = await Promise.all([
        getCurrentProfile(),
        supabase.rpc("get_hr_payroll_employee_directory"),
      ]);

      setPermissionsLoaded(true);
      setCanEdit(
        profile?.role === "super_admin" ||
          profile?.role === "admin" ||
          profile?.role === "hr",
      );

      if (error) {
        setFeedback({
          tone: "error",
          title: "Employees unavailable",
          text: "Employees could not be loaded. Please try again.",
        });
        return;
      }

      const next = (data ?? []) as Employee[];
      setEmployees(next);
      if (!employeeId && next[0]) setEmployeeId(next[0].employee_id);
    } catch {
      setPermissionsLoaded(true);
      setFeedback({
        tone: "error",
        title: "Employees unavailable",
        text: "Employees could not be loaded. Please try again.",
      });
    } finally {
      setIsLoadingEmployees(false);
    }
  }

  async function loadEmployeeData(id: string) {
    const requestId = ++dataRequestRef.current;
    clearEmployeeData(setCompensation, setVariablePay, setAdvances, setDeductions);

    if (!id) {
      setIsLoadingData(false);
      return;
    }

    setIsLoadingData(true);
    try {
      const [c, v, a, d] = await Promise.all([
        supabase
          .from("hr_compensation_records")
          .select(
            "id,employee_id,pay_type,base_rate,currency_code,pay_frequency,standard_weekly_hours,overtime_eligible,overtime_multiplier,effective_from,effective_to,reason",
          )
          .eq("employee_id", id)
          .order("effective_from", { ascending: false }),
        supabase
          .from("hr_variable_pay")
          .select("id,employee_id,pay_type,amount,earning_date,status,description")
          .eq("employee_id", id)
          .order("earning_date", { ascending: false })
          .limit(100),
        supabase
          .from("hr_advances")
          .select(
            "id,employee_id,advance_date,amount,installment_amount,balance_remaining,status,reason",
          )
          .eq("employee_id", id)
          .order("advance_date", { ascending: false }),
        supabase
          .from("hr_deductions")
          .select(
            "id,employee_id,name,deduction_type,tax_treatment,amount,percentage,frequency,effective_from,effective_to,is_active",
          )
          .eq("employee_id", id)
          .order("effective_from", { ascending: false }),
      ]);

      if (requestId !== dataRequestRef.current) return;

      if (c.error || v.error || a.error || d.error) {
        setFeedback({
          tone: "error",
          title: "Compensation unavailable",
          text: "Compensation data could not be loaded. Please try again.",
        });
        return;
      }

      setCompensation((c.data ?? []) as Compensation[]);
      setVariablePay((v.data ?? []) as VariablePay[]);
      setAdvances((a.data ?? []) as Advance[]);
      setDeductions((d.data ?? []) as Deduction[]);
    } catch {
      if (requestId === dataRequestRef.current) {
        setFeedback({
          tone: "error",
          title: "Compensation unavailable",
          text: "Compensation data could not be loaded. Please try again.",
        });
      }
    } finally {
      if (requestId === dataRequestRef.current) setIsLoadingData(false);
    }
  }

  useEffect(() => {
    void loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setFeedback(null);
    void loadEmployeeData(employeeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  async function saveComp(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !employeeId || busyAction) return;

    setBusyAction("compensation");
    setFeedback(null);
    try {
      const { error } = await supabase.from("hr_compensation_records").insert({
        employee_id: employeeId,
        pay_type: payType,
        base_rate: Number(baseRate),
        currency_code: "USD",
        pay_frequency: frequency,
        standard_weekly_hours: Number(weeklyHours),
        overtime_eligible: overtimeEligible,
        overtime_multiplier: Number(otMultiplier),
        effective_from: effectiveFrom,
        reason: compReason.trim() || null,
      });

      if (error) {
        setFeedback({
          tone: "error",
          title: "Rate not saved",
          text: "The compensation rate could not be saved. Please try again.",
        });
        return;
      }

      setBaseRate("");
      setCompReason("");
      setFeedback({
        tone: "success",
        title: "Rate saved",
        text: "The compensation rate was added successfully.",
      });
      await loadEmployeeData(employeeId);
    } finally {
      setBusyAction(null);
    }
  }

  async function saveVariable(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !employeeId || busyAction) return;

    setBusyAction("variable");
    setFeedback(null);
    try {
      const { error } = await supabase.from("hr_variable_pay").insert({
        employee_id: employeeId,
        pay_type: variableType,
        amount: Number(variableAmount),
        earning_date: earningDate,
        status: "approved",
        description: variableDescription.trim() || null,
      });

      if (error) {
        setFeedback({
          tone: "error",
          title: "Variable pay not saved",
          text: "Variable pay could not be saved. Please try again.",
        });
        return;
      }

      setVariableAmount("");
      setVariableDescription("");
      setFeedback({
        tone: "success",
        title: "Variable pay saved",
        text: "The variable pay entry was added successfully.",
      });
      await loadEmployeeData(employeeId);
    } finally {
      setBusyAction(null);
    }
  }

  async function saveAdvance(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !employeeId || busyAction) return;

    setBusyAction("advance");
    setFeedback(null);
    try {
      const amount = Number(advanceAmount);
      const { error } = await supabase.from("hr_advances").insert({
        employee_id: employeeId,
        advance_date: advanceDate,
        amount,
        balance_remaining: amount,
        repayment_method: "payroll",
        installment_amount: installment ? Number(installment) : null,
        status: "open",
        reason: advanceReason.trim() || null,
      });

      if (error) {
        setFeedback({
          tone: "error",
          title: "Advance not saved",
          text: "The employee advance could not be saved. Please try again.",
        });
        return;
      }

      setAdvanceAmount("");
      setInstallment("");
      setAdvanceReason("");
      setFeedback({
        tone: "success",
        title: "Advance saved",
        text: "The employee advance was added successfully.",
      });
      await loadEmployeeData(employeeId);
    } finally {
      setBusyAction(null);
    }
  }

  async function saveDeduction(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !employeeId || busyAction) return;

    setBusyAction("deduction");
    setFeedback(null);
    try {
      const fixed = deductionType === "fixed";
      const { error } = await supabase.from("hr_deductions").insert({
        employee_id: employeeId,
        name: deductionName.trim(),
        deduction_type: deductionType,
        tax_treatment: taxTreatment,
        amount: fixed ? Number(deductionValue) : null,
        percentage: fixed ? null : Number(deductionValue),
        frequency: deductionFrequency,
        effective_from: deductionStart,
        is_active: true,
      });

      if (error) {
        setFeedback({
          tone: "error",
          title: "Deduction not saved",
          text: "The payroll deduction could not be saved. Please try again.",
        });
        return;
      }

      setDeductionName("");
      setDeductionValue("");
      setFeedback({
        tone: "success",
        title: "Deduction saved",
        text: "The payroll deduction was added successfully.",
      });
      await loadEmployeeData(employeeId);
    } finally {
      setBusyAction(null);
    }
  }

  async function voidVariable(id: string) {
    if (!canEdit || busyAction) return;
    setBusyAction(`variable:${id}`);
    setFeedback(null);
    try {
      const { error } = await supabase
        .from("hr_variable_pay")
        .update({ status: "void" })
        .eq("id", id);

      if (error) {
        setFeedback({
          tone: "error",
          title: "Entry not updated",
          text: "The variable pay entry could not be voided. Please try again.",
        });
        return;
      }

      setFeedback({
        tone: "success",
        title: "Entry voided",
        text: "The variable pay entry was voided.",
      });
      await loadEmployeeData(employeeId);
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleDeduction(row: Deduction) {
    if (!canEdit || busyAction) return;
    setBusyAction(`deduction:${row.id}`);
    setFeedback(null);
    try {
      const { error } = await supabase
        .from("hr_deductions")
        .update({ is_active: !row.is_active })
        .eq("id", row.id);

      if (error) {
        setFeedback({
          tone: "error",
          title: "Deduction not updated",
          text: "The deduction status could not be changed. Please try again.",
        });
        return;
      }

      setFeedback({
        tone: "success",
        title: "Deduction updated",
        text: row.is_active ? "The deduction was disabled." : "The deduction was enabled.",
      });
      await loadEmployeeData(employeeId);
    } finally {
      setBusyAction(null);
    }
  }

  const selected = employees.find((employee) => employee.employee_id === employeeId);
  const currentComp = useMemo(
    () =>
      compensation.find(
        (item) =>
          item.effective_from <= today &&
          (!item.effective_to || item.effective_to >= today),
      ),
    [compensation, today],
  );

  const openAdvance = advances
    .filter((advance) => advance.status === "open")
    .reduce((sum, advance) => sum + Number(advance.balance_remaining), 0);

  const activeDeductionCount = deductions.filter((deduction) => deduction.is_active).length;
  const employeeOptions = employees.map((employee) => ({
    value: employee.employee_id,
    label: `${employee.employee_number} · ${employee.full_name}`,
  }));

  const controlsDisabled = !employeeId || Boolean(busyAction) || isLoadingData;

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`${ADMIN_TEXT_STYLES.strong} text-2xl font-semibold`}>Compensation</h1>
        <p className={`${ADMIN_TEXT_STYLES.muted} mt-1 text-sm`}>
          Manage salary/hourly rates, overtime, bonus, commission, advances and deductions.
        </p>
      </div>

      {feedback ? (
        <div role={feedback.tone === "error" ? "alert" : "status"} aria-live="polite">
          <Alert
            variant={feedback.tone}
            title={feedback.title}
            message={feedback.text}
          />
        </div>
      ) : null}

      {permissionsLoaded && !canEdit ? (
        <Alert
          variant="warning"
          title="Read-only compensation access"
          message="You can review compensation details, but only HR and administrators can change compensation setup."
        />
      ) : null}

      <ComponentCard
        title="Employee"
        desc="Choose an employee to review and manage compensation details."
      >
        <div className="max-w-2xl">
          <Label htmlFor="compensation-employee">Employee</Label>
          <Select
            id="compensation-employee"
            options={employeeOptions}
            placeholder={isLoadingEmployees ? "Loading employees..." : "Select employee"}
            value={employeeId}
            onChange={setEmployeeId}
            disabled={isLoadingEmployees || employeeOptions.length === 0}
          />
          {selected ? (
            <p className={`${ADMIN_TEXT_STYLES.muted} mt-2 text-sm`}>
              {selected.position_title || "No position"} · {selected.department_name || "No department"}
            </p>
          ) : null}
        </div>
      </ComponentCard>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Current base"
          value={currentComp ? money.format(Number(currentComp.base_rate)) : "Not set"}
          helper={
            currentComp
              ? `${readable(currentComp.pay_type)} · ${readable(currentComp.pay_frequency)}`
              : "No active compensation rate"
          }
          tone={currentComp ? "brand" : "neutral"}
        />
        <StatTile
          label="Open advances"
          value={money.format(openAdvance)}
          helper="Total outstanding advance balance"
          tone={openAdvance > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Active deductions"
          value={activeDeductionCount}
          helper="Payroll deductions currently enabled"
          tone={activeDeductionCount > 0 ? "brand" : "neutral"}
        />
      </div>

      {canEdit ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <ComponentCard
            title="New Compensation Rate"
            desc="Set a salary or hourly base rate and overtime rules."
          >
            <form onSubmit={saveComp} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="comp-rate-type">Rate type</Label>
                  <Select
                    id="comp-rate-type"
                    options={payTypeOptions}
                    value={payType}
                    onChange={setPayType}
                    disabled={controlsDisabled}
                  />
                </div>
                <div>
                  <Label htmlFor="comp-rate-amount">Amount</Label>
                  <Input
                    id="comp-rate-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={payType === "salary" ? "Annual salary" : "Hourly rate"}
                    value={baseRate}
                    onChange={(event) => setBaseRate(event.target.value)}
                    disabled={controlsDisabled}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="comp-pay-frequency">Pay frequency</Label>
                  <Select
                    id="comp-pay-frequency"
                    options={payFrequencyOptions}
                    value={frequency}
                    onChange={setFrequency}
                    disabled={controlsDisabled}
                  />
                </div>
                <div>
                  <Label htmlFor="comp-weekly-hours">Hours / week</Label>
                  <Input
                    id="comp-weekly-hours"
                    type="number"
                    min="1"
                    max="168"
                    step="0.25"
                    value={weeklyHours}
                    onChange={(event) => setWeeklyHours(event.target.value)}
                    disabled={controlsDisabled}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className={`${ADMIN_TEXT_STYLES.strong} mb-2 text-sm font-medium`}>
                    Overtime eligible
                  </p>
                  <Switch
                    id="comp-overtime-eligible"
                    label={overtimeEligible ? "Eligible for overtime" : "Not eligible for overtime"}
                    checked={overtimeEligible}
                    onChange={setOvertimeEligible}
                    disabled={controlsDisabled}
                  />
                  <p className={`${ADMIN_TEXT_STYLES.muted} mt-1.5 text-xs`}>
                    Controls whether overtime pay applies to this rate.
                  </p>
                </div>
                <div>
                  <Label htmlFor="comp-overtime-multiplier">Overtime multiplier</Label>
                  <Input
                    id="comp-overtime-multiplier"
                    type="number"
                    min="1"
                    step="0.1"
                    value={otMultiplier}
                    onChange={(event) => setOtMultiplier(event.target.value)}
                    disabled={controlsDisabled || !overtimeEligible}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="comp-effective-date">Effective date</Label>
                <Input
                  id="comp-effective-date"
                  type="date"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                  disabled={controlsDisabled}
                  required
                />
              </div>

              <div>
                <Label htmlFor="comp-reason">Reason</Label>
                <TextArea
                  id="comp-reason"
                  rows={3}
                  maxLength={200}
                  placeholder="Reason (hire, raise, promotion...)"
                  value={compReason}
                  onChange={setCompReason}
                  disabled={controlsDisabled}
                  hint={`${compReason.length}/200`}
                />
              </div>

              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={controlsDisabled || !baseRate}
              >
                {busyAction === "compensation" ? "Saving rate..." : "Add Compensation Rate"}
              </Button>
            </form>
          </ComponentCard>

          <ComponentCard
            title="Bonus / Commission / Incentive"
            desc="Record approved variable earnings for this employee."
          >
            <form onSubmit={saveVariable} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="variable-type">Type</Label>
                  <Select
                    id="variable-type"
                    options={variableTypeOptions}
                    value={variableType}
                    onChange={setVariableType}
                    disabled={controlsDisabled}
                  />
                </div>
                <div>
                  <Label htmlFor="variable-amount">Amount</Label>
                  <Input
                    id="variable-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Amount"
                    value={variableAmount}
                    onChange={(event) => setVariableAmount(event.target.value)}
                    disabled={controlsDisabled}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="variable-date">Effective date</Label>
                <Input
                  id="variable-date"
                  type="date"
                  value={earningDate}
                  onChange={(event) => setEarningDate(event.target.value)}
                  disabled={controlsDisabled}
                  required
                />
              </div>

              <div>
                <Label htmlFor="variable-description">Description (optional)</Label>
                <TextArea
                  id="variable-description"
                  rows={4}
                  maxLength={200}
                  placeholder="Describe the bonus, commission or incentive..."
                  value={variableDescription}
                  onChange={setVariableDescription}
                  disabled={controlsDisabled}
                  hint={`${variableDescription.length}/200`}
                />
              </div>

              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={controlsDisabled || !variableAmount}
              >
                {busyAction === "variable" ? "Saving variable pay..." : "Add Variable Pay"}
              </Button>
            </form>
          </ComponentCard>

          <ComponentCard
            title="Employee Advance"
            desc="Record an advance that will be repaid through payroll."
          >
            <form onSubmit={saveAdvance} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="advance-amount">Advance amount</Label>
                  <Input
                    id="advance-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Amount"
                    value={advanceAmount}
                    onChange={(event) => setAdvanceAmount(event.target.value)}
                    disabled={controlsDisabled}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="advance-date">Effective date</Label>
                  <Input
                    id="advance-date"
                    type="date"
                    value={advanceDate}
                    onChange={(event) => setAdvanceDate(event.target.value)}
                    disabled={controlsDisabled}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="advance-installment">Payroll installment (optional)</Label>
                <Input
                  id="advance-installment"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Installment per payroll"
                  value={installment}
                  onChange={(event) => setInstallment(event.target.value)}
                  disabled={controlsDisabled}
                />
              </div>

              <div>
                <Label htmlFor="advance-reason">Reason</Label>
                <TextArea
                  id="advance-reason"
                  rows={3}
                  maxLength={200}
                  placeholder="Reason for advance..."
                  value={advanceReason}
                  onChange={setAdvanceReason}
                  disabled={controlsDisabled}
                />
              </div>

              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={controlsDisabled || !advanceAmount}
              >
                {busyAction === "advance" ? "Saving advance..." : "Add Advance"}
              </Button>
            </form>
          </ComponentCard>

          <ComponentCard
            title="Payroll Deduction"
            desc="Add and configure a payroll deduction for this employee."
          >
            <form onSubmit={saveDeduction} className="space-y-5">
              <div>
                <Label htmlFor="deduction-name">Deduction name</Label>
                <Input
                  id="deduction-name"
                  placeholder="Enter deduction name"
                  value={deductionName}
                  onChange={(event) => setDeductionName(event.target.value)}
                  disabled={controlsDisabled}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="deduction-type">Amount type</Label>
                  <Select
                    id="deduction-type"
                    options={deductionTypeOptions}
                    value={deductionType}
                    onChange={setDeductionType}
                    disabled={controlsDisabled}
                  />
                </div>
                <div>
                  <Label htmlFor="deduction-value">Amount</Label>
                  <Input
                    id="deduction-value"
                    type="number"
                    min="0"
                    max={deductionType === "percent" ? "100" : undefined}
                    step="0.01"
                    placeholder={deductionType === "fixed" ? "Amount" : "Percent"}
                    value={deductionValue}
                    onChange={(event) => setDeductionValue(event.target.value)}
                    disabled={controlsDisabled}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="deduction-tax">Tax treatment</Label>
                  <Select
                    id="deduction-tax"
                    options={taxTreatmentOptions}
                    value={taxTreatment}
                    onChange={setTaxTreatment}
                    disabled={controlsDisabled}
                  />
                </div>
                <div>
                  <Label htmlFor="deduction-recurrence">Recurrence</Label>
                  <Select
                    id="deduction-recurrence"
                    options={deductionFrequencyOptions}
                    value={deductionFrequency}
                    onChange={setDeductionFrequency}
                    disabled={controlsDisabled}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="deduction-effective-date">Effective date</Label>
                <Input
                  id="deduction-effective-date"
                  type="date"
                  value={deductionStart}
                  onChange={(event) => setDeductionStart(event.target.value)}
                  disabled={controlsDisabled}
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={controlsDisabled || !deductionName.trim() || !deductionValue}
              >
                {busyAction === "deduction" ? "Saving deduction..." : "Add Deduction"}
              </Button>
            </form>
          </ComponentCard>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <ComponentCard
          title="Compensation History"
          desc="Base compensation rates ordered by effective date."
        >
          <TableViewport>
            <Table variant="admin" className="min-w-[680px]">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Effective</TableCell>
                  <TableCell isHeader variant="admin">Type</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Rate</TableCell>
                  <TableCell isHeader variant="admin">Details</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin" aria-busy={isLoadingData}>
                {isLoadingData ? (
                  <TableStateRow colSpan={4}>Loading compensation...</TableStateRow>
                ) : compensation.length === 0 ? (
                  <TableStateRow colSpan={4}>No compensation history yet.</TableStateRow>
                ) : (
                  compensation.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell variant="admin" className="whitespace-nowrap">
                        <span className={ADMIN_TEXT_STYLES.strong}>{formatDisplayDate(item.effective_from)}</span>
                        <p className={`${ADMIN_TEXT_STYLES.muted} mt-0.5 text-xs`}>
                          {item.effective_to ? `to ${formatDisplayDate(item.effective_to)}` : "Current end date"}
                        </p>
                      </TableCell>
                      <TableCell variant="admin">
                        <span className={ADMIN_TEXT_STYLES.strong}>{readable(item.pay_type)}</span>
                        <p className={`${ADMIN_TEXT_STYLES.muted} mt-0.5 text-xs`}>{readable(item.pay_frequency)}</p>
                      </TableCell>
                      <TableCell variant="admin" className="whitespace-nowrap text-right font-semibold tabular-nums">
                        {money.format(Number(item.base_rate))}
                      </TableCell>
                      <TableCell variant="admin">
                        <span>{Number(item.standard_weekly_hours)}h / week</span>
                        {item.overtime_eligible ? (
                          <p className={`${ADMIN_TEXT_STYLES.muted} mt-0.5 text-xs`}>OT ×{Number(item.overtime_multiplier)}</p>
                        ) : null}
                        {item.reason ? (
                          <p className={`${ADMIN_TEXT_STYLES.muted} mt-0.5 max-w-[260px] truncate text-xs`} title={item.reason}>{item.reason}</p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableViewport>
        </ComponentCard>

        <ComponentCard
          title="Variable Pay"
          desc="Bonuses, commissions, incentives and other variable earnings."
        >
          <TableViewport>
            <Table variant="admin" className="min-w-[720px]">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Date</TableCell>
                  <TableCell isHeader variant="admin">Type</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Amount</TableCell>
                  <TableCell isHeader variant="admin">Status</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Actions</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin" aria-busy={isLoadingData}>
                {isLoadingData ? (
                  <TableStateRow colSpan={5}>Loading compensation...</TableStateRow>
                ) : variablePay.length === 0 ? (
                  <TableStateRow colSpan={5}>No variable pay entries yet.</TableStateRow>
                ) : (
                  variablePay.map((item) => {
                    const status = getStatusPresentation(item.status);
                    return (
                      <TableRow key={item.id}>
                        <TableCell variant="admin" className="whitespace-nowrap">{formatDisplayDate(item.earning_date)}</TableCell>
                        <TableCell variant="admin">
                          <span className={ADMIN_TEXT_STYLES.strong}>{readable(item.pay_type)}</span>
                          {item.description ? (
                            <p className={`${ADMIN_TEXT_STYLES.muted} mt-0.5 max-w-[220px] truncate text-xs`} title={item.description}>{item.description}</p>
                          ) : null}
                        </TableCell>
                        <TableCell variant="admin" className="whitespace-nowrap text-right font-semibold tabular-nums">{money.format(Number(item.amount))}</TableCell>
                        <TableCell variant="admin"><Badge size="sm" color={status.color}>{status.label}</Badge></TableCell>
                        <TableCell variant="admin" className="text-right">
                          {canEdit && item.status !== "paid" && item.status !== "void" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void voidVariable(item.id)}
                              disabled={Boolean(busyAction)}
                            >
                              {busyAction === `variable:${item.id}` ? "Voiding..." : "Void"}
                            </Button>
                          ) : (
                            <span className={`${ADMIN_TEXT_STYLES.muted} text-xs`}>—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableViewport>
        </ComponentCard>

        <ComponentCard
          title="Advances"
          desc="Outstanding and historical employee advances."
        >
          <TableViewport>
            <Table variant="admin" className="min-w-[680px]">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Date</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Amount</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Balance</TableCell>
                  <TableCell isHeader variant="admin">Repayment</TableCell>
                  <TableCell isHeader variant="admin">Status</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin" aria-busy={isLoadingData}>
                {isLoadingData ? (
                  <TableStateRow colSpan={5}>Loading compensation...</TableStateRow>
                ) : advances.length === 0 ? (
                  <TableStateRow colSpan={5}>No advances yet.</TableStateRow>
                ) : (
                  advances.map((item) => {
                    const status = getStatusPresentation(item.status);
                    return (
                      <TableRow key={item.id}>
                        <TableCell variant="admin" className="whitespace-nowrap">{formatDisplayDate(item.advance_date)}</TableCell>
                        <TableCell variant="admin" className="whitespace-nowrap text-right font-semibold tabular-nums">{money.format(Number(item.amount))}</TableCell>
                        <TableCell variant="admin" className="whitespace-nowrap text-right tabular-nums">{money.format(Number(item.balance_remaining))}</TableCell>
                        <TableCell variant="admin">
                          {item.installment_amount ? `${money.format(Number(item.installment_amount))} / payroll` : "Flexible"}
                          {item.reason ? (
                            <p className={`${ADMIN_TEXT_STYLES.muted} mt-0.5 max-w-[220px] truncate text-xs`} title={item.reason}>{item.reason}</p>
                          ) : null}
                        </TableCell>
                        <TableCell variant="admin"><Badge size="sm" color={status.color}>{status.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableViewport>
        </ComponentCard>

        <ComponentCard
          title="Deductions"
          desc="Payroll deductions and their current status."
        >
          <TableViewport>
            <Table variant="admin" className="min-w-[720px]">
              <TableHeader variant="admin">
                <TableRow>
                  <TableCell isHeader variant="admin">Name</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Amount</TableCell>
                  <TableCell isHeader variant="admin">Recurrence</TableCell>
                  <TableCell isHeader variant="admin">Status</TableCell>
                  <TableCell isHeader variant="admin" className="text-right">Actions</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody variant="admin" aria-busy={isLoadingData}>
                {isLoadingData ? (
                  <TableStateRow colSpan={5}>Loading compensation...</TableStateRow>
                ) : deductions.length === 0 ? (
                  <TableStateRow colSpan={5}>No deductions yet.</TableStateRow>
                ) : (
                  deductions.map((item) => {
                    const status = getStatusPresentation(item.is_active ? "active" : "inactive");
                    return (
                      <TableRow key={item.id}>
                        <TableCell variant="admin">
                          <span className={ADMIN_TEXT_STYLES.strong}>{item.name}</span>
                          <p className={`${ADMIN_TEXT_STYLES.muted} mt-0.5 text-xs`}>{readable(item.tax_treatment)}</p>
                        </TableCell>
                        <TableCell variant="admin" className="whitespace-nowrap text-right font-semibold tabular-nums">
                          {item.deduction_type === "fixed" ? money.format(Number(item.amount || 0)) : `${Number(item.percentage || 0)}%`}
                        </TableCell>
                        <TableCell variant="admin">{readable(item.frequency)}</TableCell>
                        <TableCell variant="admin"><Badge size="sm" color={status.color}>{status.label}</Badge></TableCell>
                        <TableCell variant="admin" className="text-right">
                          {canEdit ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void toggleDeduction(item)}
                              disabled={Boolean(busyAction)}
                            >
                              {busyAction === `deduction:${item.id}` ? "Updating..." : item.is_active ? "Disable" : "Enable"}
                            </Button>
                          ) : (
                            <span className={`${ADMIN_TEXT_STYLES.muted} text-xs`}>—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableViewport>
        </ComponentCard>
      </div>
    </div>
  );
}
