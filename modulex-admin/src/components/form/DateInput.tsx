"use client";

import { useEffect, useState } from "react";
import Input from "./input/InputField";
import { formatDateInput, parseDateInput } from "@/lib/dates/usDate";

export type DateInputProps = {
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
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

export default function DateInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  placeholder = "MM.DD.YYYY",
  className,
  required = false,
  readOnly = false,
  disabled = false,
  error = false,
  hint,
  ariaLabel,
  ariaDescribedBy,
}: DateInputProps) {
  const [draft, setDraft] = useState(() => formatDateInput(value));
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(formatDateInput(value));
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

    if (nextDraft.length === 10) {
      const parsed = parseDateInput(nextDraft);
      if (parsed.ok) onChange(parsed.value);
    }
  }

  function handleBlur() {
    if (draft) {
      const parsed = parseDateInput(draft);
      if (!parsed.ok) setValidationError(parsed.error);
    } else if (required) {
      setValidationError("Enter a date as MM.DD.YYYY.");
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
      maxLength={10}
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
