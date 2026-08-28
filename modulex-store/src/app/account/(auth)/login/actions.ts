"use server";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isStorePortalContext } from "@/lib/portal/auth";
export type AccountLoginState={error:string|null};
export const initialAccountLoginState:AccountLoginState={error:null};
export async function accountLoginAction(_prev:AccountLoginState,formData:FormData):Promise<AccountLoginState>{
 const email=String(formData.get("email")||"").trim().toLowerCase(); const password=String(formData.get("password")||"");
 if(!email||!password)return{error:"Enter your email address and password."};
 const supabase=await createServerSupabaseClient(); const {error}=await supabase.auth.signInWithPassword({email,password});
 if(error)return{error:"Unable to sign in with those credentials."};
 const {data:claims}=await supabase.auth.getClaims(); const meta=claims?.claims?.app_metadata as Record<string,unknown>|undefined;
 const accountType=meta?.account_type;
 if(accountType!=="dealer_portal"&&accountType!=="customer_portal"){await supabase.auth.signOut({scope:"local"});return{error:"Account access is unavailable."};}
 const {data:context,error:contextError}=await supabase.rpc("get_store_portal_context");
 if(contextError||!isStorePortalContext(context)|| (context.portal_kind==="dealer"?"dealer_portal":"customer_portal")!==accountType){await supabase.auth.signOut({scope:"local"});return{error:"Account access is unavailable."};}
 redirect(context.portal_kind==="dealer"?"/dealer":"/account");
}
