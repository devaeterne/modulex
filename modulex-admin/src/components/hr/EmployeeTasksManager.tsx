"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import StatTile from "@/components/common/StatTile";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableStateRow, TableViewport } from "@/components/ui/table";
import { ADMIN_TEXT_STYLES, type AdminStatusColor } from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";

type Employee = { id: string; employee_number: string; first_name: string; last_name: string; employment_status: string };
type Task = { id: string; employee_id: string; task_type: string; title: string; description: string | null; due_date: string | null; completed_at: string | null; status: string; sort_order: number };
type Notice = { variant: "success" | "error" | "info"; title: string; message: string };

const onboarding = ["Complete employment documents", "Complete W-4 and I-9 workflow", "Create system access", "Assign equipment / workspace", "Benefits enrollment review", "Orientation and policy acknowledgment", "Manager introduction / first-week plan"];
const offboarding = ["Confirm final working date", "Collect company equipment", "Disable system access", "Final payroll / deductions review", "Benefits termination / continuation review", "Exit interview", "Archive employment records"];

function formatDate(value: string | null) { if (!value) return "—"; const [year, month, day] = value.split("-"); return year && month && day ? `${day}.${month}.${year}` : value; }
function labelize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function statusColor(status: string): AdminStatusColor { if (status === "completed") return "success"; if (status === "in_progress") return "primary"; if (status === "cancelled") return "light"; return "warning"; }

export default function EmployeeTasksManager() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [taskType, setTaskType] = useState("onboarding");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function fail(titleText: string, message: string, error: unknown) { console.error(titleText, error); setNotice({ variant: "error", title: titleText, message }); }

  async function load() {
    setLoading(true);
    try {
      const [e, t] = await Promise.all([
        supabase.from("hr_employees").select("id,employee_number,first_name,last_name,employment_status").order("last_name"),
        supabase.from("hr_employee_tasks").select("id,employee_id,task_type,title,description,due_date,completed_at,status,sort_order").order("status").order("due_date"),
      ]);
      if (e.error) throw e.error; if (t.error) throw t.error;
      const nextEmployees = (e.data ?? []) as Employee[];
      setEmployees(nextEmployees); setTasks((t.data ?? []) as Task[]);
      if (!employeeId && nextEmployees[0]) setEmployeeId(nextEmployees[0].id);
    } catch (error) { fail("Lifecycle tasks unavailable", "Employee lifecycle tasks could not be loaded. Please try again.", error); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function addTask(event: FormEvent) {
    event.preventDefault(); setBusy("add"); setNotice(null);
    const { error } = await supabase.from("hr_employee_tasks").insert({ employee_id: employeeId, task_type: taskType, title: title.trim(), description: description.trim() || null, due_date: dueDate || null, status: "pending" });
    if (error) fail("Task not added", "The lifecycle task could not be added. Please try again.", error);
    else { setTitle(""); setDescription(""); setDueDate(""); setNotice({ variant: "success", title: "Task added", message: "The lifecycle task is ready to work." }); await load(); }
    setBusy(null);
  }

  async function applyTemplate(kind: "onboarding" | "offboarding") {
    if (!employeeId) return; setBusy(`template-${kind}`); setNotice(null);
    const template = kind === "onboarding" ? onboarding : offboarding;
    const existing = new Set(tasks.filter((task) => task.employee_id === employeeId && task.task_type === kind).map((task) => task.title));
    const rows = template.filter((item) => !existing.has(item)).map((taskTitle, index) => ({ employee_id: employeeId, task_type: kind, title: taskTitle, status: "pending", sort_order: (index + 1) * 10 }));
    if (!rows.length) { setNotice({ variant: "info", title: "Template already applied", message: `All ${kind} template tasks already exist for this employee.` }); setBusy(null); return; }
    const { error } = await supabase.from("hr_employee_tasks").insert(rows);
    if (error) fail("Template not applied", `The ${kind} template could not be applied. Please try again.`, error);
    else { setNotice({ variant: "success", title: "Template applied", message: `${rows.length} ${kind} task(s) added.` }); await load(); }
    setBusy(null);
  }

  async function setStatus(row: Task, status: string) {
    setBusy(row.id); setNotice(null);
    const { error } = await supabase.from("hr_employee_tasks").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", row.id);
    if (error) fail("Task not updated", "The task status could not be changed. Please try again.", error);
    else { setNotice({ variant: "success", title: "Task updated", message: `Task marked ${labelize(status).toLowerCase()}.` }); await load(); }
    setBusy(null);
  }

  async function remove(id: string) {
    setBusy(id); setNotice(null);
    const { error } = await supabase.from("hr_employee_tasks").delete().eq("id", id);
    if (error) fail("Task not deleted", "The lifecycle task could not be deleted. Please try again.", error);
    else { setDeleteCandidateId(null); setNotice({ variant: "success", title: "Task deleted", message: "The lifecycle task was removed." }); await load(); }
    setBusy(null);
  }

  const employeeOptions = employees.map((employee) => ({ value: employee.id, label: `${employee.employee_number} · ${employee.first_name} ${employee.last_name} · ${labelize(employee.employment_status)}` }));
  const filtered = employeeId ? tasks.filter((task) => task.employee_id === employeeId) : tasks;
  const pending = tasks.filter((task) => task.status === "pending" || task.status === "in_progress").length;
  const overdue = tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled" && task.due_date && new Date(`${task.due_date}T23:59:59`) < new Date()).length;
  const selectedEmployee = useMemo(() => employees.find((employee) => employee.id === employeeId), [employees, employeeId]);

  return <div className="space-y-6">
    {notice ? <Alert variant={notice.variant} title={notice.title} message={notice.message} /> : null}
    <div className="grid gap-4 sm:grid-cols-2"><StatTile label="Open tasks" value={loading ? "—" : pending} /><StatTile label="Overdue tasks" value={loading ? "—" : overdue} tone={overdue > 0 ? "warning" : "neutral"} /></div>
    <ComponentCard title="Employee workflow" desc="Select an employee and apply a standard onboarding or offboarding checklist.">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end"><div><Label htmlFor="lifecycle-employee">Employee</Label><Select id="lifecycle-employee" options={employeeOptions} value={employeeId} onChange={(value) => { setEmployeeId(value); setDeleteCandidateId(null); }} placeholder="Select employee" /></div><Button variant="outline" onClick={() => void applyTemplate("onboarding")} disabled={!employeeId || busy !== null}>{busy === "template-onboarding" ? "Applying…" : "Apply Onboarding Template"}</Button><Button variant="outline" onClick={() => void applyTemplate("offboarding")} disabled={!employeeId || busy !== null}>{busy === "template-offboarding" ? "Applying…" : "Apply Offboarding Template"}</Button></div>
      {selectedEmployee ? <p className={`${ADMIN_TEXT_STYLES.muted} text-xs`}>Showing tasks for {selectedEmployee.first_name} {selectedEmployee.last_name}.</p> : null}
    </ComponentCard>
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <form onSubmit={addTask}><ComponentCard title="Add Task" desc="Create an employee-specific lifecycle task."><div><Label htmlFor="lifecycle-type">Task type</Label><Select id="lifecycle-type" options={[{ value: "onboarding", label: "Onboarding" }, { value: "offboarding", label: "Offboarding" }, { value: "general", label: "General" }]} value={taskType} onChange={setTaskType} /></div><div><Label htmlFor="lifecycle-title">Task title</Label><Input id="lifecycle-title" value={title} onChange={(event) => setTitle(event.target.value)} required /></div><div><Label htmlFor="lifecycle-description">Description</Label><TextArea id="lifecycle-description" rows={4} value={description} onChange={setDescription} placeholder="Optional task details" /></div><div><Label htmlFor="lifecycle-due">Due date</Label><Input id="lifecycle-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div><Button type="submit" className="w-full" disabled={!employeeId || busy !== null}>{busy === "add" ? "Adding…" : "Add Task"}</Button></ComponentCard></form>
      <ComponentCard title="Lifecycle Tasks" desc="Start, complete or remove tasks for the selected employee."><TableViewport><Table variant="admin" minWidth="wide"><TableHeader variant="admin"><TableRow><TableCell isHeader variant="admin">Task</TableCell><TableCell isHeader variant="admin">Type</TableCell><TableCell isHeader variant="admin">Due</TableCell><TableCell isHeader variant="admin">Status</TableCell><TableCell isHeader variant="admin">Actions</TableCell></TableRow></TableHeader><TableBody variant="admin" aria-busy={loading}>
        {loading ? <TableStateRow colSpan={5}>Loading lifecycle tasks…</TableStateRow> : filtered.length === 0 ? <TableStateRow colSpan={5}>No tasks for this employee.</TableStateRow> : filtered.map((task) => <TableRow key={task.id}><TableCell variant="admin"><p className={ADMIN_TEXT_STYLES.strong}>{task.title}</p>{task.description ? <p className={`${ADMIN_TEXT_STYLES.muted} mt-1 text-xs`}>{task.description}</p> : null}</TableCell><TableCell variant="admin">{labelize(task.task_type)}</TableCell><TableCell variant="admin" className="whitespace-nowrap">{formatDate(task.due_date)}</TableCell><TableCell variant="admin"><Badge color={statusColor(task.status)}>{labelize(task.status)}</Badge></TableCell><TableCell variant="admin"><div className="flex flex-wrap justify-end gap-2">{task.status === "pending" ? <Button size="sm" variant="outline" onClick={() => void setStatus(task, "in_progress")} disabled={busy !== null}>Start</Button> : null}{task.status !== "completed" ? <Button size="sm" variant="outline" onClick={() => void setStatus(task, "completed")} disabled={busy !== null}>Complete</Button> : null}{deleteCandidateId === task.id ? <><Button size="sm" variant="outline" onClick={() => setDeleteCandidateId(null)} disabled={busy === task.id}>Cancel</Button><Button size="sm" onClick={() => void remove(task.id)} disabled={busy === task.id}>{busy === task.id ? "Deleting…" : "Confirm delete"}</Button></> : <Button size="sm" variant="outline" onClick={() => setDeleteCandidateId(task.id)} disabled={busy !== null}>Delete</Button>}</div></TableCell></TableRow>)}
      </TableBody></Table></TableViewport></ComponentCard>
    </div>
  </div>;
}
