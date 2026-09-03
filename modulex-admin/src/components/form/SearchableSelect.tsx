"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ADMIN_CONTROL_DISABLED,
  ADMIN_FIELD_BASE,
  ADMIN_FIELD_STATES,
  ADMIN_FOCUS_RING,
  ADMIN_SURFACE_POPOVER,
} from "@/components/ui/theme/adminTheme";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  options: SearchableSelectOption[];
  value?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  noResultsText?: string;
  allowEmpty?: boolean;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  error?: boolean;
  ariaLabel?: string;
  className?: string;
};

export default function SearchableSelect({
  options,
  value = "",
  placeholder = "Select an option",
  searchPlaceholder = "Search…",
  noResultsText = "No matching options.",
  allowEmpty = false,
  onChange,
  disabled = false,
  required = false,
  error = false,
  ariaLabel,
  className = "",
}: SearchableSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, query]);

  useEffect(() => {
    if (!isOpen) return;
    searchRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  const stateClass = disabled
    ? ADMIN_FIELD_STATES.disabled
    : error
      ? ADMIN_FIELD_STATES.error
      : ADMIN_FIELD_STATES.default;

  function close() {
    setIsOpen(false);
    setQuery("");
  }

  function selectValue(nextValue: string) {
    onChange(nextValue);
    close();
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
    }
    if (event.key === "Escape") close();
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key === "Enter" && filteredOptions.length === 1) {
      event.preventDefault();
      selectValue(filteredOptions[0].value);
    }
  }

  return (
    <div ref={rootRef} className={`relative w-full ${className}`}>
      <button
        type="button"
        className={`${ADMIN_FIELD_BASE} ${stateClass} ${ADMIN_FOCUS_RING} ${ADMIN_CONTROL_DISABLED} flex items-center justify-between gap-3 text-left`}
        onClick={() => {
          if (!disabled) setIsOpen((open) => !open);
        }}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-required={required || undefined}
        aria-invalid={error || undefined}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-gray-400 dark:text-gray-400"}`}>
          {selected?.label ?? placeholder}
        </span>
        <svg
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 stroke-current transition-transform ${isOpen ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
        >
          <path d="M4.75 7.5 10 12.5l5.25-5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen ? (
        <div className={`absolute left-0 top-full z-50 mt-2 w-full p-2 ${ADMIN_SURFACE_POPOVER}`}>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className={`${ADMIN_FIELD_BASE} ${ADMIN_FIELD_STATES.default} ${ADMIN_FOCUS_RING}`}
          />
          <div id={listboxId} role="listbox" className="mt-2 max-h-64 overflow-y-auto py-1">
            {allowEmpty ? (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${!value ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.06]"}`}
                onClick={() => selectValue("")}
              >
                {placeholder}
              </button>
            ) : null}
            {filteredOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${isSelected ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.06]"}`}
                  onClick={() => selectValue(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">{noResultsText}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
