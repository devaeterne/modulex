import React, { FC, useId } from "react";
import {
  ADMIN_FIELD_BASE,
  ADMIN_FIELD_STATES,
  ADMIN_FOCUS_RING,
} from "@/components/ui/theme/adminTheme";

interface InputProps {
  type?: "text" | "number" | "email" | "password" | "date" | "time" | "tel" | "url" | string;
  id?: string;
  name?: string;
  placeholder?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  className?: string;
  min?: string | number;
  max?: string | number;
  minLength?: number;
  maxLength?: number;
  step?: number | string;
  pattern?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  required?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  success?: boolean;
  error?: boolean;
  hint?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
}

const Input: FC<InputProps> = ({
  type = "text",
  id,
  name,
  placeholder,
  value,
  defaultValue,
  onChange,
  onBlur,
  className = "",
  min,
  max,
  minLength,
  maxLength,
  step,
  pattern,
  inputMode,
  autoComplete,
  required = false,
  readOnly = false,
  disabled = false,
  success = false,
  error = false,
  hint,
  ariaLabel,
  ariaDescribedBy,
}) => {
  const generatedHintId = useId();
  const state = disabled ? "disabled" : error ? "error" : success ? "success" : "default";
  const hintId = hint ? (id ? `${id}-hint` : generatedHintId) : undefined;
  const describedBy = [ariaDescribedBy, hintId].filter(Boolean).join(" ") || undefined;
  const inputClasses = `${ADMIN_FIELD_BASE} ${ADMIN_FIELD_STATES[state]} ${ADMIN_FOCUS_RING} ${className}`;

  const hintClass = error
    ? "text-error-600 dark:text-error-300"
    : success
      ? "text-success-600 dark:text-success-300"
      : "text-gray-500 dark:text-gray-400";

  return (
    <div className="relative">
      <input
        type={type}
        id={id}
        name={name}
        placeholder={placeholder}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={onChange}
        onBlur={onBlur}
        min={min}
        max={max}
        minLength={minLength}
        maxLength={maxLength}
        step={step}
        pattern={pattern}
        inputMode={inputMode}
        autoComplete={autoComplete}
        required={required}
        readOnly={readOnly}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={error || undefined}
        aria-describedby={describedBy}
        className={inputClasses}
      />

      {hint ? (
        <p
          id={hintId}
          role={error ? "alert" : undefined}
          className={`mt-1.5 text-xs ${hintClass}`}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
};

export default Input;
