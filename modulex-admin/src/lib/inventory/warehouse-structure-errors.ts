type WarehouseStructureError = {
  code?: string | null;
  message?: string | null;
};

const FALLBACK_MESSAGE = "Warehouse structure could not be updated.";

export function formatWarehouseStructureError(
  error: WarehouseStructureError | null | undefined
) {
  const message = error?.message?.trim();

  if (!message) return FALLBACK_MESSAGE;

  if (
    /cannot be deactivated while .*active stock|cannot be deactivated while .*reservations/i.test(
      message
    )
  ) {
    return `${message} Move stock to an active location before retrying.`;
  }

  if (/active zones/i.test(message)) {
    return `${message} Deactivate or migrate the child zones first.`;
  }

  if (/active locations/i.test(message)) {
    return `${message} Deactivate or migrate the child locations first.`;
  }

  if (/same warehouse/i.test(message)) {
    return `${message} Choose a zone/location from the same warehouse.`;
  }

  if (/requires an active warehouse/i.test(message)) {
    return `${message} Activate the parent warehouse or choose another warehouse.`;
  }

  if (/requires an active zone/i.test(message)) {
    return `${message} Activate the parent zone or choose another zone.`;
  }

  if (/while inventory rows are assigned/i.test(message)) {
    return `${message} Move stock explicitly before changing the warehouse assignment.`;
  }

  if (/while locations are assigned/i.test(message)) {
    return `${message} Move or reassign locations explicitly before changing the warehouse.`;
  }

  if (error?.code === "23503") {
    return "This warehouse structure is still referenced by operational records. Migrate those references before deleting it.";
  }

  return message;
}
