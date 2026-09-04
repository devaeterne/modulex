import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import Label from "@/components/form/Label";
import {
  ADMIN_CONTROL_DISABLED,
  ADMIN_FIELD_BASE,
  ADMIN_FIELD_STATES,
  ADMIN_FOCUS_RING,
  ADMIN_SURFACE_POPOVER,
} from "@/components/ui/theme/adminTheme";

interface Option {
  value: string;
  text: string;
  selected: boolean;
}

interface MultiSelectProps {
  id?: string;
  label: string;
  options: Option[];
  defaultSelected?: string[];
  onChange?: (selected: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  id,
  label,
  options,
  defaultSelected = [],
  onChange,
  disabled = false,
  placeholder = "Select options",
}) => {
  const generatedId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>(defaultSelected);
  const [isOpen, setIsOpen] = useState(false);

  const triggerId = id ?? `multi-select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  const selectedValuesText = useMemo(
    () =>
      selectedOptions
        .map((value) => options.find((option) => option.value === value)?.text)
        .filter((value): value is string => Boolean(value)),
    [options, selectedOptions]
  );

  const toggleDropdown = () => {
    if (disabled) return;
    setIsOpen((current) => !current);
  };

  const handleSelect = (optionValue: string) => {
    const nextSelectedOptions = selectedOptions.includes(optionValue)
      ? selectedOptions.filter((value) => value !== optionValue)
      : [...selectedOptions, optionValue];

    setSelectedOptions(nextSelectedOptions);
    onChange?.(nextSelectedOptions);
  };

  const stateClass = disabled ? ADMIN_FIELD_STATES.disabled : ADMIN_FIELD_STATES.default;

  return (
    <div ref={rootRef} className="w-full">
      <Label htmlFor={triggerId}>{label}</Label>

      <div className="relative w-full">
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          onClick={toggleDropdown}
          className={`${ADMIN_FIELD_BASE} ${stateClass} ${ADMIN_FOCUS_RING} ${ADMIN_CONTROL_DISABLED} flex h-auto min-h-11 items-center justify-between gap-3 py-1.5 pr-3 text-left`}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {selectedValuesText.length > 0 ? (
              selectedValuesText.map((text) => (
                <span
                  key={text}
                  className="max-w-full rounded-full bg-gray-100 px-2.5 py-1 text-sm text-gray-800 dark:bg-gray-800 dark:text-white/90"
                >
                  {text}
                </span>
              ))
            ) : (
              <span className="text-sm text-gray-400 dark:text-white/30">{placeholder}</span>
            )}
          </span>

          <svg
            aria-hidden="true"
            className={`h-5 w-5 shrink-0 stroke-current text-gray-500 transition-transform dark:text-gray-400 ${
              isOpen ? "rotate-180" : ""
            }`}
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4.79175 7.39551L10.0001 12.6038L15.2084 7.39551"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {isOpen ? (
          <div
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            className={`${ADMIN_SURFACE_POPOVER} absolute left-0 top-[calc(100%+0.375rem)] z-40 max-h-select w-full overflow-y-auto p-1`}
          >
            {options.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {options.map((option) => {
                  const isSelected = selectedOptions.includes(option.value);

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(option.value)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${ADMIN_FOCUS_RING} ${
                        isSelected
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                          : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="min-w-0 flex-1">{option.text}</span>
                      {isSelected ? (
                        <svg
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 stroke-current"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="m3.5 8 3 3 6-6"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No options available.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default MultiSelect;
