"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export default function AccountForgotPasswordForm(){
 const [email,setEmail]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);
 async function handleSubmit(event:FormEvent<HTMLFormElement>){event.preventDefault();const cleanEmail=email.trim().toLowerCase();if(!cleanEmail){setError("Enter your email address.");return;}setBusy(true);setError(null);setMessage(null);try{const supabase=createBrowserSupabaseClient();const redirectTo=`${window.location.origin}/account/reset-password`;const {error:resetError}=await supabase.auth.resetPasswordForEmail(cleanEmail,{redirectTo});if(resetError){setError("Password reset is temporarily unavailable. Please try again.");return;}setMessage("If an eligible account exists for this email, a password reset link has been sent.");}catch{setError("Password reset is temporarily unavailable. Please try again.");}finally{setBusy(false);}}
 return <form onSubmit={handleSubmit}>{error?<div className="alert alert-warning" role="alert">{error}</div>:null}{message?<div className="alert alert-success" role="status">{message}</div>:null}<div className="mb-4"><label className="form-label" htmlFor="account-reset-email">Email</label><input id="account-reset-email" className="form-control" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={busy} required/></div><button className="btn btn-dark w-100" type="submit" disabled={busy}>{busy?"Sending…":"Send reset link"}</button><div className="text-center mt-4"><Link href="/account/login" className="small text-secondary">Back to sign in</Link></div></form>;
}
