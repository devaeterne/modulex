"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Summary={employees:number;active:number;onLeave:number;departments:number;pendingLeave:number;openTasks:number;expiringDocs:number;openPayroll:number};
const card="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900";

export default function PersonnelOverview(){
 const [summary,setSummary]=useState<Summary>({employees:0,active:0,onLeave:0,departments:0,pendingLeave:0,openTasks:0,expiringDocs:0,openPayroll:0});const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);
 useEffect(()=>{async function load(){setLoading(true);setError(null);const soon=new Date();soon.setDate(soon.getDate()+60);const today=new Date().toISOString().slice(0,10);const soonDate=soon.toISOString().slice(0,10);const [employees,departments,leave,tasks,docs,payroll]=await Promise.all([supabase.from("hr_employees").select("employment_status"),supabase.from("hr_departments").select("id",{count:"exact",head:true}).eq("is_active",true),supabase.from("hr_leave_requests").select("id",{count:"exact",head:true}).eq("status","pending"),supabase.from("hr_employee_tasks").select("id",{count:"exact",head:true}).in("status",["pending","in_progress"]),supabase.from("hr_documents").select("id",{count:"exact",head:true}).eq("status","active").gte("expires_on",today).lte("expires_on",soonDate),supabase.from("hr_payroll_periods").select("id",{count:"exact",head:true}).neq("status","closed")]);const first=employees.error??departments.error??leave.error??tasks.error??docs.error??payroll.error;if(first){setError(first.message);setLoading(false);return;}const rows=employees.data??[];setSummary({employees:rows.length,active:rows.filter(r=>r.employment_status==="active").length,onLeave:rows.filter(r=>r.employment_status==="on_leave").length,departments:departments.count??0,pendingLeave:leave.count??0,openTasks:tasks.count??0,expiringDocs:docs.count??0,openPayroll:payroll.count??0});setLoading(false);}void load();},[]);
 const cards=[["Employees",summary.employees,"All employee records"],["Active",summary.active,"Currently active"],["On Leave",summary.onLeave,"Employment status"],["Pending Leave",summary.pendingLeave,"Needs HR decision"],["Open Tasks",summary.openTasks,"Onboarding / offboarding"],["Expiring Documents",summary.expiringDocs,"Within 60 days"],["Open Payroll",summary.openPayroll,"Periods not closed"],["Departments",summary.departments,"Active departments"]];
 const modules=[
  ["/personnel/employees","Employees","Employee master data, status, department, position, manager and employment history."],
  ["/personnel/attendance","Attendance","Daily hours, overtime, lateness, absence and no-show tracking."],
  ["/personnel/leave","Leave & PTO","Leave policies, balances, requests and approvals."],
  ["/personnel/compensation","Compensation","Salary/hourly rates, bonus, commission, advances and deductions."],
  ["/personnel/payroll","Payroll","Payroll periods, runs, taxes, net pay and employer cost."],
  ["/personnel/benefits","Benefits","Benefit plans and employee enrollments."],
  ["/personnel/documents","Documents","Private employee documents, licenses and expiration tracking."],
  ["/personnel/compliance","Compliance & Emergency","W-4/I-9 profile, work authorization and emergency contacts."],
  ["/personnel/lifecycle","Onboarding & Offboarding","Standard lifecycle checklists and task tracking."],
  ["/personnel/performance","Performance","Probation, periodic and annual performance reviews."],
  ["/personnel/reports","HR Reports","Headcount, attendance, leave, compliance and payroll reporting."],
  ["/personnel/departments","Organization","Departments and job positions used across HR."],
 ] as const;
 return <div className="space-y-6"><div className={card}><h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Personnel & HR</h1><p className="mt-2 max-w-4xl text-sm text-gray-500 dark:text-gray-400">Central employee lifecycle management from hire through attendance, leave, compensation, payroll, benefits, compliance, performance and offboarding.</p></div>{error&&<div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label,value,note])=><div key={String(label)} className={card}><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{loading?"—":value}</p><p className="mt-1 text-xs text-gray-400">{note}</p></div>)}</div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{modules.map(([href,title,description])=><Link key={href} href={href} className={card+" transition hover:border-brand-300 dark:hover:border-brand-500/50"}><h2 className="font-semibold text-gray-800 dark:text-white/90">{title}</h2><p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p><span className="mt-4 inline-flex text-sm font-medium text-brand-500">Open →</span></Link>)}</div></div>;
}
