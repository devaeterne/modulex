import type React from "react";
import { ADMIN_FOCUS_RING } from "@/components/ui/theme/adminTheme";

interface CheckboxProps {
  label?: string;
  checked: boolean;
  className?: string;
  id?: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
}

const Checkbox: React.FC<CheckboxProps> = ({
  label,
  checked,
  id,
  onChange,
  className = "",
  disabled = false,
  ariaLabel,
  ariaDescribedBy,
}) => {
  return (
    <label
      className={`group flex items-center gap-3 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
    >
      <span className="relative h-5 w-5 shrink-0">
        <input
          id={id}
          type="checkbox"
          className={`peer h-5 w-5 appearance-none rounded-md border border-gray-300 bg-white transition-colors checked:border-brand-500 checked:bg-brand-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:checked:border-gray-300 disabled:checked:bg-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:checked:border-brand-500 dark:checked:bg-brand-500 dark:disabled:bg-gray-800 dark:disabled:checked:border-gray-700 dark:disabled:checked:bg-gray-700 ${ADMIN_FOCUS_RING} ${className}`}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
        />
        {checked ? (
          <svg
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white peer-disabled:text-gray-500 dark:peer-disabled:text-gray-300"
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M11.6666 3.5L5.24992 9.91667L2.33325 7"
              stroke="currentColor"
              strokeWidth="1.94437"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      {label ? (
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
          {label}
        </span>
      ) : null}
    </label>
  );
};

export default Checkbox;
