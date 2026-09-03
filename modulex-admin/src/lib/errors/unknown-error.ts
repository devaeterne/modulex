type UnknownErrorRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownErrorRecord | null {
  return typeof value === "object" && value !== null ? (value as UnknownErrorRecord) : null;
}

function stringField(record: UnknownErrorRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberField(record: UnknownErrorRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function unknownErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const record = asRecord(error);
  return stringField(record, "message") ?? stringField(record, "error_description") ?? fallback;
}

export function serializeUnknownError(error: unknown) {
  const record = asRecord(error);
  const serialized: Record<string, unknown> = {
    message: unknownErrorMessage(error, "Unknown error"),
  };

  const name = error instanceof Error ? error.name : stringField(record, "name");
  const code = stringField(record, "code");
  const details = stringField(record, "details");
  const hint = stringField(record, "hint");
  const status = numberField(record, "status") ?? numberField(record, "statusCode");

  if (name) serialized.name = name;
  if (code) serialized.code = code;
  if (details) serialized.details = details;
  if (hint) serialized.hint = hint;
  if (status !== undefined) serialized.status = status;
  if (error instanceof Error && error.stack) serialized.stack = error.stack;

  return serialized;
}
