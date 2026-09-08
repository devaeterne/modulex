"use client";

import { useEffect, useState } from "react";
import Input from "./input/InputField";
import { formatDateTimeInput, parseDateTimeInput } from "@/lib/dates/usDate";

export type DateTimeInputProps = {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  error?: boolean;
  hint?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
};

function normalizeDraft(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
  if (digits.length <= 10) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)} ${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)} ${digits.slice(8, 10)}:${digits.slice(10)}`;
}

export default function DateTimeInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  placeholder = "MM.DD.YYYY HH:MM",
  className,
  required = false,
  readOnly = false,
  disabled = false,
  error = false,
  hint,
  ariaLabel,
  ariaDescribedBy,
}: DateTimeInputProps) {
  const [draft, setDraft] = useState(() => formatDateTimeInput(value));
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(formatDateTimeInput(value));
    setValidationError(null);
  }, [value]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextDraft = normalizeDraft(event.target.value);
    setDraft(nextDraft);
    setValidationError(null);

    if (!nextDraft) {
      onChange("");
      return;
    }

    if (nextDraft.length === 16) {
      const parsed = parseDateTimeInput(nextDraft);
      if (parsed.ok) onChange(parsed.value);
    }
  }

  function handleBlur() {
    if (draft) {
      const parsed = parseDateTimeInput(draft);
      if (!parsed.ok) {
        setValidationError(parsed.error);
        onChange("");
      }
    } else if (required) {
      setValidationError("Enter a date and time as MM.DD.YYYY HH:MM.");
    }
    onBlur?.();
  }

  const visibleHint = validationError ?? hint;
  const hasError = error || Boolean(validationError);

  return (
    <Input
      type="text"
      id={id}
      name={name}
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      inputMode="numeric"
      maxLength={16}
      autoComplete="off"
      required={required}
      readOnly={readOnly}
      disabled={disabled}
      error={hasError}
      hint={visibleHint}
      ariaLabel={ariaLabel}
      ariaDescribedBy={ariaDescribedBy}
    />
  );
}
