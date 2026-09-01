"use client";

import React, { useState } from "react";
import { ADMIN_FOCUS_RING } from "@/components/ui/theme/adminTheme";

interface SwitchProps {
  label: string;
  defaultChecked?: boolean;
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  color?: "blue" | "gray";
  id?: string;
  ariaDescribedBy?: string;
}

const Switch: React.FC<SwitchProps> = ({
  label,
  defaultChecked = false,
  checked,
  disabled = false,
  onChange,
  color = "blue",
  id,
  ariaDescribedBy,
}) => {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isControlled = checked !== undefined;
  const isChecked = checked ?? internalChecked;

  const handleToggle = () => {
    if (disabled) return;
    const nextChecked = !isChecked;
    if (!isControlled) setInternalChecked(nextChecked);
    onChange?.(nextChecked);
  };

  const checkedTrack =
    color === "blue"
      ? "bg-brand-500 dark:bg-brand-500"
      : "bg-gray-800 dark:bg-gray-300";
  const uncheckedTrack = "bg-gray-200 dark:bg-white/10";
  const trackClass = disabled
    ? "bg-gray-100 dark:bg-gray-800"
    : isChecked
      ? checkedTrack
      : uncheckedTrack;

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={isChecked}
      aria-describedby={ariaDescribedBy}
      disabled={disabled}
      onClick={handleToggle}
      className={`inline-flex items-center gap-3 rounded-lg text-left text-sm font-medium transition-colors ${ADMIN_FOCUS_RING} ${
        disabled
          ? "cursor-not-allowed text-gray-400 opacity-60 dark:text-gray-500"
          : "text-gray-700 dark:text-gray-300"
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative block h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ease-linear ${trackClass}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-theme-sm transition-transform duration-150 ease-linear ${
            isChecked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
      <span>{label}</span>
    </button>
  );
};

export default Switch;
