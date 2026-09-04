import React, { useState } from "react";
import {
  ADMIN_CONTROL_DISABLED,
  ADMIN_FIELD_BASE,
  ADMIN_FIELD_STATES,
  ADMIN_FOCUS_RING,
} from "@/components/ui/theme/adminTheme";

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  id?: string;
  name?: string;
  options: Option[];
  placeholder?: string;
  allowEmpty?: boolean;
  onChange: (value: string) => void;
  onBlur?: (event: React.FocusEvent<HTMLSelectElement>) => void;
  className?: string;
  defaultValue?: string;
  value?: string;
  disabled?: boolean;
  required?: boolean;
  error?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
}

const Select: React.FC<SelectProps> = ({
  id,
  name,
  options,
  placeholder = "Select an option",
  allowEmpty = false,
  onChange,
  onBlur,
  className = "",
  defaultValue = "",
  value,
  disabled = false,
  required = false,
  error = false,
  ariaLabel,
  ariaDescribedBy,
}) => {
  const [selectedValue, setSelectedValue] = useState<string>(defaultValue);
  const effectiveValue = value ?? selectedValue;

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    setSelectedValue(nextValue);
    onChange(nextValue);
  };

  const stateClass = disabled
    ? ADMIN_FIELD_STATES.disabled
    : error
      ? ADMIN_FIELD_STATES.error
      : ADMIN_FIELD_STATES.default;
  const placeholderClass = effectiveValue ? "" : "text-gray-400 dark:text-white/30";
  const chevronClass = disabled
    ? "text-gray-400 opacity-60 dark:text-gray-500"
    : "text-gray-500 dark:text-gray-400";

  return (
    <div className="relative w-full">
      <select
        id={id}
        name={name}
        className={`${ADMIN_FIELD_BASE} ${stateClass} ${ADMIN_FOCUS_RING} ${ADMIN_CONTROL_DISABLED} ${placeholderClass} pr-11 ${className}`}
        value={effectiveValue}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={error || undefined}
      >
        <option
          value=""
          disabled={!allowEmpty}
          className="bg-white text-gray-500 dark:bg-gray-900 dark:text-gray-400"
        >
          {placeholder}
        </option>
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            className="bg-white text-gray-800 dark:bg-gray-900 dark:text-white/90"
          >
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className={`pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 ${chevronClass}`}
      >
        <path
          d="m6 8 4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

export default Select;
