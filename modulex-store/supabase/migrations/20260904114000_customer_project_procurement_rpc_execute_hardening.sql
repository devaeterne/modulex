-- PB-3B runtime hardening: public SECURITY INVOKER wrappers must be able to
-- reach the private SECURITY DEFINER cores. Business-role authorization stays
-- inside each private core; anon remains unable to execute the private functions.

grant execute on function private.get_customer_project_procurement(uuid) to authenticated;
grant execute on function private.get_customer_project_procurement_status(uuid) to authenticated;
grant execute on function private.set_customer_project_procurement_vendor(uuid,text,text) to authenticated;
grant execute on function private.create_customer_project_procurement_commitment(uuid,numeric,numeric,text,text) to authenticated;
grant execute on function private.confirm_customer_project_procurement_commitment(uuid) to authenticated;
grant execute on function private.cancel_customer_project_procurement_commitment(uuid,text) to authenticated;
grant execute on function private.record_customer_project_procurement_delivery(uuid,numeric,date,text) to authenticated;
grant execute on function private.correct_customer_project_procurement_delivery(uuid,numeric,text) to authenticated;
grant execute on function private.record_customer_project_procurement_invoice(uuid,text,date,numeric,text,numeric,numeric) to authenticated;
grant execute on function private.reverse_customer_project_procurement_invoice_allocation(uuid,text) to authenticated;

revoke all on function private.get_customer_project_procurement(uuid) from anon;
revoke all on function private.get_customer_project_procurement_status(uuid) from anon;
revoke all on function private.set_customer_project_procurement_vendor(uuid,text,text) from anon;
revoke all on function private.create_customer_project_procurement_commitment(uuid,numeric,numeric,text,text) from anon;
revoke all on function private.confirm_customer_project_procurement_commitment(uuid) from anon;
revoke all on function private.cancel_customer_project_procurement_commitment(uuid,text) from anon;
revoke all on function private.record_customer_project_procurement_delivery(uuid,numeric,date,text) from anon;
revoke all on function private.correct_customer_project_procurement_delivery(uuid,numeric,text) from anon;
revoke all on function private.record_customer_project_procurement_invoice(uuid,text,date,numeric,text,numeric,numeric) from anon;
revoke all on function private.reverse_customer_project_procurement_invoice_allocation(uuid,text) from anon;
