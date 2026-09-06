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
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";
import { supabase } from "@/lib/supabase/client";

type Employee = { id: string; employee_number: string; first_name: string; last_name: string };
type Review = { id: string; employee_id: string; reviewer_id: string | null; review_type: string; period_start: string | null; period_end: string | null; review_date: string | null; overall_rating: number | null; goals: string | null; strengths: string | null; development_areas: string | null; manager_comments: string | null; employee_comments: string | null; status: string };
type Notice = { variant: "success" | "error"; title: string; message: string };

function labelize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string | null) { if (!value) return "—"; const [year, month, day] = value.split("-"); return year && month && day ? `${day}.${month}.${year}` : value; }

export default function PerformanceManager() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [reviewType, setReviewType] = useState("annual");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().slice(0, 10));
  const [rating, setRating] = useState("");
  const [goals, setGoals] = useState("");
  const [strengths, setStrengths] = useState("");
  const [development, setDevelopment] = useState("");
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function fail(title: string, message: string, error: unknown) { console.error(title, error); setNotice({ variant: "error", title, message }); }

  async function load() {
    setLoading(true);
    try {
      const [e, r] = await Promise.all([
        supabase.from("hr_employees").select("id,employee_number,first_name,last_name").order("last_name"),
        supabase.from("hr_performance_reviews").select("id,employee_id,reviewer_id,review_type,period_start,period_end,review_date,overall_rating,goals,strengths,development_areas,manager_comments,employee_comments,status").order("review_date", { ascending: false }).limit(300),
      ]);
      if (e.error) throw e.error; if (r.error) throw r.error;
      const nextEmployees = (e.data ?? []) as Employee[];
      setEmployees(nextEmployees); setReviews((r.data ?? []) as Review[]);
      if (!employeeId && nextEmployees[0]) setEmployeeId(nextEmployees[0].id);
    } catch (error) { fail("Performance unavailable", "Performance reviews could not be loaded. Please try again.", error); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy("save"); setNotice(null);
    const { error } = await supabase.from("hr_performance_reviews").insert({ employee_id: employeeId, reviewer_id: reviewerId || null, review_type: reviewType, period_start: periodStart || null, period_end: periodEnd || null, review_date: reviewDate || null, overall_rating: rating ? Number(rating) : null, goals: goals.trim() || null, strengths: strengths.trim() || null, development_areas: development.trim() || null, manager_comments: comments.trim() || null, status: "completed" });
    if (error) fail("Review not saved", "The performance review could not be saved. Please try again.", error);
    else { setRating(""); setGoals(""); setStrengths(""); setDevelopment(""); setComments(""); setNotice({ variant: "success", title: "Review saved", message: "The completed performance review was recorded." }); await load(); }
    setBusy(null);
  }

  async function remove(id: string) {
    setBusy(id); setNotice(null);
    const { error } = await supabase.from("hr_performance_reviews").delete().eq("id", id);
    if (error) fail("Review not deleted", "The performance review could not be deleted. Please try again.", error);
    else { setDeleteCandidateId(null); setNotice({ variant: "success", title: "Review deleted", message: "The performance review was removed." }); await load(); }
    setBusy(null);
  }

  const employeeOptions = employees.map((employee) => ({ value: employee.id, label: `${employee.employee_number} · ${employee.first_name} ${employee.last_name}` }));
  const reviewerOptions = employees.filter((employee) => employee.id !== employeeId).map((employee) => ({ value: employee.id, label: `${employee.first_name} ${employee.last_name}` }));
  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.id, `${employee.employee_number} · ${employee.first_name} ${employee.last_name}`])), [employees]);
  const selected = employeeId ? reviews.filter((review) => review.employee_id === employeeId) : reviews;
  const rated = reviews.filter((review) => review.overall_rating != null);
  const average = rated.reduce((sum, review) => sum + Number(review.overall_rating), 0) / (rated.length || 1);

  return <div className="space-y-6">
    {notice ? <Alert variant={notice.variant} title={notice.title} message={notice.message} /> : null}
    <div className="grid gap-4 sm:grid-cols-2"><StatTile label="Completed reviews" value={loading ? "—" : reviews.filter((review) => review.status === "completed").length} /><StatTile label="Average rating" value={loading ? "—" : `${average.toFixed(2)} / 5`} /></div>
    <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <form onSubmit={save}><ComponentCard title="New Review" desc="Record probation, periodic or annual performance feedback.">
        <div><Label htmlFor="performance-employee">Employee</Label><Select id="performance-employee" options={employeeOptions} value={employeeId} onChange={(value) => { setEmployeeId(value); setDeleteCandidateId(null); }} placeholder="Select employee" /></div>
        <div><Label htmlFor="performance-reviewer">Reviewer</Label><Select id="performance-reviewer" options={reviewerOptions} value={reviewerId} onChange={setReviewerId} allowEmpty placeholder="Reviewer not specified" /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="performance-type">Review type</Label><Select id="performance-type" options={["probation", "quarterly", "semiannual", "annual", "ad_hoc"].map((value) => ({ value, label: labelize(value) }))} value={reviewType} onChange={setReviewType} /></div><div><Label htmlFor="performance-rating">Rating (0–5)</Label><Input id="performance-rating" type="number" min="0" max="5" step="0.1" value={rating} onChange={(event) => setRating(event.target.value)} /></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="performance-start">Period start</Label><Input id="performance-start" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></div><div><Label htmlFor="performance-end">Period end</Label><Input id="performance-end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></div></div>
        <div><Label htmlFor="performance-date">Review date</Label><Input id="performance-date" type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} /></div>
        <div><Label htmlFor="performance-goals">Goals</Label><TextArea id="performance-goals" rows={4} value={goals} onChange={setGoals} /></div><div><Label htmlFor="performance-strengths">Strengths</Label><TextArea id="performance-strengths" rows={4} value={strengths} onChange={setStrengths} /></div><div><Label htmlFor="performance-development">Development areas</Label><TextArea id="performance-development" rows={4} value={development} onChange={setDevelopment} /></div><div><Label htmlFor="performance-comments">Manager comments</Label><TextArea id="performance-comments" rows={4} value={comments} onChange={setComments} /></div>
        <Button type="submit" className="w-full" disabled={!employeeId || busy !== null}>{busy === "save" ? "Saving…" : "Save Review"}</Button>
      </ComponentCard></form>
      <ComponentCard title="Review History" desc="Completed reviews for the selected employee.">
        <div className="space-y-4" aria-busy={loading}>
          {loading ? <p className={`${ADMIN_TEXT_STYLES.muted} text-sm`}>Loading performance reviews…</p> : selected.length === 0 ? <p className={`${ADMIN_TEXT_STYLES.muted} py-8 text-center text-sm`}>No performance reviews yet.</p> : selected.map((review) => <article key={review.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className={`${ADMIN_TEXT_STYLES.strong} font-semibold`}>{employeeMap.get(review.employee_id) || "Unknown employee"}</h3><div className="mt-1 flex flex-wrap items-center gap-2"><Badge color="info">{labelize(review.review_type)}</Badge><Badge color={review.status === "completed" ? "success" : "warning"}>{labelize(review.status)}</Badge><span className={`${ADMIN_TEXT_STYLES.muted} text-xs`}>{formatDate(review.review_date)}</span></div></div><div className="flex flex-wrap items-center gap-2">{review.overall_rating != null ? <Badge color="primary">{Number(review.overall_rating).toFixed(1)} / 5</Badge> : null}{deleteCandidateId === review.id ? <><Button size="sm" variant="outline" onClick={() => setDeleteCandidateId(null)} disabled={busy === review.id}>Cancel</Button><Button size="sm" onClick={() => void remove(review.id)} disabled={busy === review.id}>{busy === review.id ? "Deleting…" : "Confirm delete"}</Button></> : <Button size="sm" variant="outline" onClick={() => setDeleteCandidateId(review.id)} disabled={busy !== null}>Delete</Button>}</div></div>{review.period_start || review.period_end ? <p className={`${ADMIN_TEXT_STYLES.muted} mt-3 text-xs`}>Review period: {formatDate(review.period_start)} → {formatDate(review.period_end)}</p> : null}{review.strengths ? <p className={`${ADMIN_TEXT_STYLES.body} mt-3 text-sm`}><strong className={ADMIN_TEXT_STYLES.strong}>Strengths:</strong> {review.strengths}</p> : null}{review.development_areas ? <p className={`${ADMIN_TEXT_STYLES.body} mt-2 text-sm`}><strong className={ADMIN_TEXT_STYLES.strong}>Development:</strong> {review.development_areas}</p> : null}{review.goals ? <p className={`${ADMIN_TEXT_STYLES.body} mt-2 text-sm`}><strong className={ADMIN_TEXT_STYLES.strong}>Goals:</strong> {review.goals}</p> : null}{review.manager_comments ? <p className={`${ADMIN_TEXT_STYLES.muted} mt-2 text-sm`}>{review.manager_comments}</p> : null}</article>)}
        </div>
      </ComponentCard>
    </div>
  </div>;
}
