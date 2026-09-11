import { hasPermission } from "@/lib/auth/permissions";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

function nullableText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

async function requireOrderManager() {
  const { profile, error } = await getCurrentProfile();
  if (error) throw error;
  if (!profile || !hasPermission(profile.role, "orders.manage")) {
    throw new Error("You do not have permission to manage customer orders.");
  }
}

export async function updateCustomerOrderCustomerReference(input: {
  orderId: string;
  customerReference: string;
  revisionReason?: string | null;
}): Promise<number> {
  await requireOrderManager();

  const { data, error } = await supabase.rpc(
    "update_customer_order_customer_reference",
    {
      p_order_id: input.orderId,
      p_customer_reference: nullableText(input.customerReference),
      p_revision_reason: nullableText(input.revisionReason),
    }
  );

  if (error) throw error;
  return Number(data ?? 0);
}
