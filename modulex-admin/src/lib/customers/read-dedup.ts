import { supabase } from "@/lib/supabase/client";
import type { Customer, CustomerDocument, CustomerOrder } from "@/lib/customers/types";

const customerRequests = new Map<string, Promise<Customer>>();
const customerDocumentRequests = new Map<string, Promise<CustomerDocument[]>>();
const customerOrderRequests = new Map<string, Promise<CustomerOrder>>();

function shareInFlight<T>(
  requests: Map<string, Promise<T>>,
  key: string,
  loader: () => Promise<T>
) {
  const existing = requests.get(key);
  if (existing) return existing;

  const request = loader();
  requests.set(key, request);

  const clear = () => {
    if (requests.get(key) === request) requests.delete(key);
  };

  request.then(clear, clear);
  return request;
}

export function loadCustomerRecord(customerId: string) {
  return shareInFlight(customerRequests, customerId, async () => {
    const { data, error } = await supabase.from("customers").select("*").eq("id", customerId).single();
    if (error) throw error;
    return data as Customer;
  });
}

export function loadCustomerDocuments(customerId: string) {
  return shareInFlight(customerDocumentRequests, customerId, async () => {
    const { data, error } = await supabase
      .from("customer_documents")
      .select("*")
      .eq("customer_id", customerId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CustomerDocument[];
  });
}

export function loadCustomerOrderRecord(customerId: string, orderId: string) {
  return shareInFlight(customerOrderRequests, `${customerId}:${orderId}`, async () => {
    const { data, error } = await supabase
      .from("customer_orders")
      .select("*")
      .eq("id", orderId)
      .eq("customer_id", customerId)
      .single();
    if (error) throw error;
    return data as CustomerOrder;
  });
}
