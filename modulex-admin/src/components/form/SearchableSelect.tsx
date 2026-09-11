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
  onSearchChange?: (query: string) => void;
  loading?: boolean;
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
  onSearchChange,
  loading = false,
  disabled = false,
  required = false,
  error = false,
  ariaLabel,
  className = "",
}: SearchableSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchChangeRef = useRef(onSearchChange);
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const hasRemoteSearch = Boolean(onSearchChange);

  useEffect(() => {
    searchChangeRef.current = onSearchChange;
  }, [onSearchChange]);

  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    if (hasRemoteSearch) return options;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [hasRemoteSearch, options, query]);

  const optionId = (index: number) => `${listboxId}-option-${index}`;

  useEffect(() => {
    if (!isOpen) return;
    const selectedIndex = filteredOptions.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : filteredOptions.length > 0 ? 0 : -1);
    searchRef.current?.focus();
  }, [filteredOptions, isOpen, value]);

  useEffect(() => {
    if (!isOpen || !hasRemoteSearch) return;
    const timeout = window.setTimeout(() => searchChangeRef.current?.(query), 250);
    return () => window.clearTimeout(timeout);
  }, [hasRemoteSearch, isOpen, query]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
        setActiveIndex(-1);
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

  function close(restoreFocus = false) {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(-1);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function selectValue(nextValue: string) {
    onChange(nextValue);
    close(true);
  }

  function moveActive(delta: number) {
    if (filteredOptions.length === 0) return;
    setActiveIndex((current) => {
      const start = current < 0 ? (delta > 0 ? -1 : 0) : current;
      return (start + delta + filteredOptions.length) % filteredOptions.length;
    });
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
    }
    if (event.key === "Escape") close(true);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === "Home" && filteredOptions.length > 0) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && filteredOptions.length > 0) {
      event.preventDefault();
      setActiveIndex(filteredOptions.length - 1);
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0 && filteredOptions[activeIndex]) {
      event.preventDefault();
      selectValue(filteredOptions[activeIndex].value);
    }
  }

  return (
    <div ref={rootRef} className={`relative w-full ${className}`}>
      <button
        ref={triggerRef}
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
            role="combobox"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
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
            {loading ? <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400" role="status">Loading options…</p> : null}
            {!loading ? filteredOptions.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  id={optionId(index)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${isSelected ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.06]"}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectValue(option.value)}
                >
                  {option.label}
                </button>
              );
            }) : null}
            {!loading && filteredOptions.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400" role="status">{noResultsText}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
