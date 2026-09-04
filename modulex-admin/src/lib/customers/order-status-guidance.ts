type RpcLikeError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

export type OrderStatusGuidance = {
  reason: string;
  requiredAction: string;
  internalOwner: string;
  technicalDetail: string;
};

export function extractOrderStatusError(error: unknown): { code: string | null; message: string } {
  if (error instanceof Error) {
    return { code: null, message: error.message || "Unable to update order status." };
  }

  if (error && typeof error === "object") {
    const candidate = error as RpcLikeError;
    const code = typeof candidate.code === "string" && candidate.code.trim() ? candidate.code.trim() : null;
    const message = typeof candidate.message === "string" && candidate.message.trim()
      ? candidate.message.trim()
      : "Unable to update order status.";
    return { code, message };
  }

  return {
    code: null,
    message: typeof error === "string" && error.trim() ? error.trim() : "Unable to update order status.",
  };
}

function technicalDetail(code: string | null, message: string) {
  return code ? `${code}: ${message}` : message;
}

export function getOrderStatusGuidance(error: unknown): OrderStatusGuidance {
  const normalized = extractOrderStatusError(error);
  const message = normalized.message;
  const lower = message.toLowerCase();
  const detail = technicalDetail(normalized.code, message);

  if (lower.includes("shipping address is required")) {
    return {
      reason: "A delivery address has not been assigned to this Order.",
      requiredAction: "Edit the Order, select an active customer shipping address, save it, then retry the status change.",
      internalOwner: "Sales / Customer Service",
      technicalDetail: detail,
    };
  }

  if (lower.includes("shipping address must be an active address")) {
    return {
      reason: "The selected delivery address is inactive or does not belong to this customer.",
      requiredAction: "Select an active shipping address owned by this customer, save the Order, then retry.",
      internalOwner: "Sales / Customer Service",
      technicalDetail: detail,
    };
  }

  if (message.includes("STANDALONE_STOCK_SHORTAGE") || message.includes("ORDER_STOCK_SHORTAGE")) {
    const shortage = message.match(/SKU\s+([^\s]+)\s+requires\s+([0-9.]+)\s+more unit\(s\)/i);
    const sku = shortage?.[1] ?? "an Order item";
    const quantity = shortage?.[2] ? Number(shortage[2]) : null;
    const quantityText = quantity !== null && Number.isFinite(quantity) ? ` ${quantity:g}` : "";
    return {
      reason: `Sellable inventory is insufficient for ${sku}.${quantityText ? `${quantityText} additional unit(s) are required.` : ""}`,
      requiredAction: "Receive or transfer stock into a sellable warehouse, or correct the Order quantity, then retry. Project-linked shortages should flow to Procurement instead of blocking confirmation.",
      internalOwner: "Inventory / Warehouse",
      technicalDetail: detail,
    };
  }

  if (message.includes("ORDER_HAS_RESERVED_STOCK")) {
    return {
      reason: "This Order still has active reserved stock that has not been fulfilled or released.",
      requiredAction: "Complete the warehouse fulfillment step or release the remaining reservation before advancing the Order status.",
      internalOwner: "Warehouse / Shipping",
      technicalDetail: detail,
    };
  }

  if (lower.includes("price group") && (lower.includes("cannot be used") || lower.includes("inactive"))) {
    return {
      reason: "The Order is using a Price Group that is no longer valid for customer Orders.",
      requiredAction: "Edit the Order and select an active Order-enabled Price Group, then retry.",
      internalOwner: "Sales / Pricing Admin",
      technicalDetail: detail,
    };
  }

  if (lower.includes("payment method") && (lower.includes("inactive") || lower.includes("does not exist"))) {
    return {
      reason: "The selected Payment Method is missing or inactive.",
      requiredAction: "Edit the Order and choose an active Payment Method, or ask Finance/Admin to reactivate the intended method.",
      internalOwner: "Sales / Finance Admin",
      technicalDetail: detail,
    };
  }

  if (lower.includes("tax rate")) {
    return {
      reason: "The Order tax rate does not match the active fulfillment tax rule.",
      requiredAction: "Review the fulfillment type and tax rule, correct the Order tax rate, then retry.",
      internalOwner: "Sales / Admin",
      technicalDetail: detail,
    };
  }

  if (lower.includes("at least one order item")) {
    return {
      reason: "The Order has no line items and cannot be confirmed.",
      requiredAction: "Add at least one valid Order item, save the Order, then retry.",
      internalOwner: "Sales",
      technicalDetail: detail,
    };
  }

  if (lower.includes("confirmed orders require active products")) {
    return {
      reason: "One or more Order lines have an inactive product or invalid quantity, price, discount, or pricing source.",
      requiredAction: "Review the Order lines, replace inactive products and correct invalid commercial values before retrying.",
      internalOwner: "Sales / Product Admin",
      technicalDetail: detail,
    };
  }

  if (lower.includes("invalid customer order status transition")) {
    return {
      reason: "The requested status transition is not allowed by the Order lifecycle.",
      requiredAction: "Choose the next valid Order status. If a backward correction is required, use the controlled approval/correction workflow.",
      internalOwner: "Sales / Admin",
      technicalDetail: detail,
    };
  }

  if (lower.includes("use the shipment") || lower.includes("ready for shipment") || lower.includes("pickup orders")) {
    return {
      reason: "This status must be advanced through the Shipment / Pickup fulfillment workflow rather than directly from the Order.",
      requiredAction: "Open the related Shipment or Pickup workflow and complete the required fulfillment step there.",
      internalOwner: "Shipping / Warehouse",
      technicalDetail: detail,
    };
  }

  if (lower.includes("use the installation") || lower.includes("delivery + installation")) {
    return {
      reason: "This status is controlled by the Installation workflow.",
      requiredAction: "Open the related Installation and complete the required installation step there.",
      internalOwner: "Installation",
      technicalDetail: detail,
    };
  }

  if (lower.includes("permission")) {
    return {
      reason: "Your role does not have permission to perform this Order status change.",
      requiredAction: "Ask an Admin to perform or approve the action, or review your assigned permissions.",
      internalOwner: "Admin",
      technicalDetail: detail,
    };
  }

  return {
    reason: message,
    requiredAction: "Retry once after reviewing the Order. If the same error repeats, contact Admin / System Support and provide the technical detail below.",
    internalOwner: "Admin / System Support",
    technicalDetail: detail,
  };
}
