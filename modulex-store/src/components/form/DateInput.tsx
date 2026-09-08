"use client";

import { useEffect, useState } from "react";
import { formatDateInput, parseDateInput } from "@/lib/dates/usDate";

export type DateInputProps = {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
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
  placeholder = "MM.DD.YYYY",
  className,
  required = false,
  disabled = false,
  ariaLabel,
  ariaDescribedBy,
}: DateInputProps) {
  const [draft, setDraft] = useState(() => formatDateInput(value));

  useEffect(() => {
    setDraft(formatDateInput(value));
  }, [value]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextDraft = normalizeDraft(event.target.value);
    setDraft(nextDraft);

    if (!nextDraft) {
      event.target.setCustomValidity("");
      onChange("");
      return;
    }

    if (nextDraft.length === 10) {
      const parsed = parseDateInput(nextDraft);
      event.target.setCustomValidity(parsed.ok ? "" : "Enter a date as MM.DD.YYYY.");
      if (parsed.ok) onChange(parsed.value);
      return;
    }

    event.target.setCustomValidity("Enter a date as MM.DD.YYYY.");
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (!draft) {
      event.target.setCustomValidity(required ? "Enter a date as MM.DD.YYYY." : "");
      return;
    }
    const parsed = parseDateInput(draft);
    event.target.setCustomValidity(parsed.ok ? "" : "Enter a date as MM.DD.YYYY.");
  }

  return (
    <>
      <input
        id={id}
        type="text"
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
        inputMode="numeric"
        maxLength={10}
        autoComplete="off"
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
      />
      {name ? <input type="hidden" name={name} value={value} disabled={disabled} /> : null}
    </>
  );
}
