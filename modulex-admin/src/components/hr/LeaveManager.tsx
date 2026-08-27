"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";

type Employee = { id: string; employee_number: string; first_name: string; last_name: string };
type LeaveType = { id: string; code: string; name: string; paid: boolean; default_annual_hours: number; is_active: boolean };
type LeaveRequest = { id: string; employee_id: string; leave_type_id: string; start_date: string; end_date: string; requested_hours: number; status: string; employee_note: string | null; decision_note: string | null; created_at: string };
type LeaveBalance = { id: string; employee_id: string; leave_type_id: string; balance_year: number; entitled_hours: number; carried_hours: number; adjusted_hours: number; used_hours: number; pending_hours: number };

const inputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const cardClass = "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]";

function employeeName(row: Employee) { return `${row.employee_number} · ${row.first_name} ${row.last_name}`; }
function available(balance: LeaveBalance) { return Number(balance.entitled_hours) + Number(balance.carried_hours) + Number(balance.adjusted_hours) - Number(balance.used_hours) - Number(balance.pending_hours); }

export default function LeaveManager() {
  const currentYear = new Date().getFullYear();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0,10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0,10));
  const [hours, setHours] = useState("8");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [typeCode, setTypeCode] = useState("");
  const [typeName, setTypeName] = useState("");
  const [typeHours, setTypeHours] = useState("0");
  const [typePaid, setTypePaid] = useState(true);

  async function load() {
    const [e,t,r,b] = await Promise.all([
      supabase.from("hr_employees").select("id,employee_number,first_name,last_name").in("employment_status",["active","on_leave"]).order("last_name"),
      supabase.from("hr_leave_types").select("id,code,name,paid,default_annual_hours,is_active").order("sort_order"),
      supabase.from("hr_leave_requests").select("id,employee_id,leave_type_id,start_date,end_date,requested_hours,status,employee_note,decision_note,created_at").order("created_at",{ascending:false}).limit(300),
      supabase.from("hr_leave_balances").select("id,employee_id,leave_type_id,balance_year,entitled_hours,carried_hours,adjusted_hours,used_hours,pending_hours").eq("balance_year",currentYear),
    ]);
    for (const result of [e,t,r,b]) if (result.error) throw result.error;
    const nextEmployees=(e.data??[]) as Employee[];
    const nextTypes=(t.data??[]) as LeaveType[];
    setEmployees(nextEmployees); setLeaveTypes(nextTypes); setRequests((r.data??[]) as LeaveRequest[]); setBalances((b.data??[]) as LeaveBalance[]);
    if (!employeeId && nextEmployees[0]) setEmployeeId(nextEmployees[0].id);
    if (!leaveTypeId && nextTypes.find(x=>x.is_active)) setLeaveTypeId(nextTypes.find(x=>x.is_active)!.id);
  }

  useEffect(()=>{ void load().catch(error=>setMessage(error instanceof Error?error.message:"Leave data could not be loaded.")); // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  async function submitRequest(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const { error } = await supabase.from("hr_leave_requests").insert({ employee_id:employeeId, leave_type_id:leaveTypeId, start_date:startDate, end_date:endDate, requested_hours:Number(hours), employee_note:note.trim()||null });
    setBusy(false);
    if (error) return setMessage(error.message);
    setMessage("Leave request created."); setNote(""); await load();
  }

  async function decide(id:string,status:"approved"|"rejected"|"cancelled") {
    const decision = status === "approved" ? window.prompt("Approval note (optional)") : window.prompt("Decision note (optional)");
    const { error } = await supabase.rpc("set_hr_leave_request_status", { p_request_id:id, p_status:status, p_decision_note:decision||null });
    if (error) setMessage(error.message); else { setMessage(`Request ${status}.`); await load(); }
  }

  async function initializeBalances() {
    setBusy(true);
    const { data,error }=await supabase.rpc("initialize_hr_leave_balances",{p_year:currentYear});
    setBusy(false);
    if(error) return setMessage(error.message);
    setMessage(`${Number(data??0)} leave balance record(s) initialized for ${currentYear}.`); await load();
  }

  async function createLeaveType(event:FormEvent) {
    event.preventDefault();
    const {error}=await supabase.from("hr_leave_types").insert({code:typeCode.trim().toUpperCase(),name:typeName.trim(),paid:typePaid,default_annual_hours:Number(typeHours||0)});
    if(error) return setMessage(error.message);
    setTypeCode(""); setTypeName(""); setTypeHours("0"); setMessage("Leave type created."); await load();
  }

  const employeeMap=useMemo(()=>new Map(employees.map(e=>[e.id,e])),[employees]);
  const typeMap=useMemo(()=>new Map(leaveTypes.map(t=>[t.id,t])),[leaveTypes]);
  const pending=requests.filter(r=>r.status==="pending").length;
  const approved=requests.filter(r=>r.status==="approved" && new Date(r.end_date)>=new Date()).length;
  const used=balances.reduce((sum,b)=>sum+Number(b.used_hours||0),0);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Leave & PTO</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage leave policies, annual balances, requests and approvals.</p></div><button onClick={()=>void initializeBalances()} disabled={busy} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">Initialize {currentYear} Balances</button></div>
    {message && <div className={cardClass+" text-sm text-gray-700 dark:text-gray-300"}>{message}</div>}
    <div className="grid gap-4 sm:grid-cols-3">{[["Pending requests",pending],["Approved upcoming",approved],[`${currentYear} used hours`,used.toFixed(2)]].map(([label,value])=><div key={String(label)} className={cardClass}><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p></div>)}</div>

    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <div className="space-y-6">
        <form onSubmit={submitRequest} className={cardClass+" space-y-4"}>
          <h2 className="font-semibold text-gray-800 dark:text-white/90">New Leave Request</h2>
          <label className="block text-sm text-gray-600 dark:text-gray-300">Employee<select className={inputClass+" mt-1"} value={employeeId} onChange={e=>setEmployeeId(e.target.value)} required><option value="">Select employee</option>{employees.map(e=><option key={e.id} value={e.id}>{employeeName(e)}</option>)}</select></label>
          <label className="block text-sm text-gray-600 dark:text-gray-300">Leave type<select className={inputClass+" mt-1"} value={leaveTypeId} onChange={e=>setLeaveTypeId(e.target.value)} required>{leaveTypes.filter(t=>t.is_active).map(t=><option key={t.id} value={t.id}>{t.name}{t.paid?" · Paid":" · Unpaid"}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label className="block text-sm text-gray-600 dark:text-gray-300">From<input type="date" className={inputClass+" mt-1"} value={startDate} onChange={e=>setStartDate(e.target.value)} /></label><label className="block text-sm text-gray-600 dark:text-gray-300">To<input type="date" className={inputClass+" mt-1"} value={endDate} onChange={e=>setEndDate(e.target.value)} /></label></div>
          <label className="block text-sm text-gray-600 dark:text-gray-300">Hours<input type="number" min="0.25" step="0.25" className={inputClass+" mt-1"} value={hours} onChange={e=>setHours(e.target.value)} /></label>
          <label className="block text-sm text-gray-600 dark:text-gray-300">Note<textarea className="mt-1 min-h-20 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" value={note} onChange={e=>setNote(e.target.value)} /></label>
          <button disabled={busy} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white disabled:opacity-50">Create Request</button>
        </form>

        <form onSubmit={createLeaveType} className={cardClass+" space-y-3"}>
          <div><h2 className="font-semibold text-gray-800 dark:text-white/90">Leave Types</h2><p className="mt-1 text-xs text-gray-500">PTO, sick, unpaid and company-specific policies.</p></div>
          <div className="grid grid-cols-2 gap-3"><input className={inputClass} placeholder="Code" value={typeCode} onChange={e=>setTypeCode(e.target.value)} required/><input className={inputClass} placeholder="Name" value={typeName} onChange={e=>setTypeName(e.target.value)} required/></div>
          <input className={inputClass} type="number" min="0" step="0.25" placeholder="Annual hours" value={typeHours} onChange={e=>setTypeHours(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"><input type="checkbox" checked={typePaid} onChange={e=>setTypePaid(e.target.checked)} /> Paid leave</label>
          <button className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-medium dark:border-gray-700">Add Leave Type</button>
          <div className="space-y-2 pt-2">{leaveTypes.map(t=><div key={t.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-white/[0.03]"><span><b>{t.code}</b> · {t.name}</span><span className="text-gray-500">{Number(t.default_annual_hours)}h</span></div>)}</div>
        </form>
      </div>

      <div className="space-y-6">
        <div className={cardClass+" overflow-hidden p-0"}><div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800"><h2 className="font-semibold text-gray-800 dark:text-white/90">Requests</h2></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/[0.02]"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Leave</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3 text-right">Hours</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{requests.map(r=><tr key={r.id}><td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">{employeeMap.get(r.employee_id)?employeeName(employeeMap.get(r.employee_id)!):r.employee_id}</td><td className="px-4 py-3">{typeMap.get(r.leave_type_id)?.name??r.leave_type_id}</td><td className="px-4 py-3">{r.start_date} → {r.end_date}</td><td className="px-4 py-3 text-right">{Number(r.requested_hours).toFixed(2)}</td><td className="px-4 py-3 capitalize">{r.status}</td><td className="px-4 py-3 text-right">{r.status==="pending"?<div className="flex justify-end gap-2"><button onClick={()=>void decide(r.id,"approved")} className="text-xs font-medium text-success-600">Approve</button><button onClick={()=>void decide(r.id,"rejected")} className="text-xs font-medium text-error-600">Reject</button></div>:null}</td></tr>)}{requests.length===0&&<tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No leave requests.</td></tr>}</tbody></table></div></div>

        <div className={cardClass+" overflow-hidden p-0"}><div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800"><h2 className="font-semibold text-gray-800 dark:text-white/90">{currentYear} Balances</h2></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/[0.02]"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">Entitled</th><th className="px-4 py-3 text-right">Used</th><th className="px-4 py-3 text-right">Pending</th><th className="px-4 py-3 text-right">Available</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{balances.map(b=><tr key={b.id}><td className="px-4 py-3">{employeeMap.get(b.employee_id)?employeeName(employeeMap.get(b.employee_id)!):b.employee_id}</td><td className="px-4 py-3">{typeMap.get(b.leave_type_id)?.name??b.leave_type_id}</td><td className="px-4 py-3 text-right">{Number(b.entitled_hours).toFixed(2)}</td><td className="px-4 py-3 text-right">{Number(b.used_hours).toFixed(2)}</td><td className="px-4 py-3 text-right">{Number(b.pending_hours).toFixed(2)}</td><td className="px-4 py-3 text-right font-semibold">{available(b).toFixed(2)}</td></tr>)}</tbody></table></div></div>
      </div>
    </div>
  </div>;
}
