"use client";

import React, { useEffect, useRef } from "react";
import {
  ADMIN_FOCUS_RING,
  ADMIN_SURFACE_MODAL,
} from "@/components/ui/theme/adminTheme";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
  isFullscreen?: boolean;
  closeOnEscape?: boolean;
  backdropCloseEvent?: "click" | "mouseDown";
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className = "",
  showCloseButton = true,
  isFullscreen = false,
  closeOnEscape = true,
  backdropCloseEvent = "click",
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const firstFocusable = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (firstFocusable ?? modalRef.current)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );

      if (focusable.length === 0) {
        event.preventDefault();
        modalRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [closeOnEscape, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const contentClasses = isFullscreen
    ? "h-full w-full bg-white dark:bg-gray-900"
    : ADMIN_SURFACE_MODAL;

  return (
    <div className="modal fixed inset-0 z-99999 flex items-center justify-center overflow-y-auto">
      {!isFullscreen ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 h-full w-full bg-gray-950/50 backdrop-blur-sm"
          onClick={backdropCloseEvent === "click" ? onClose : undefined}
          onMouseDown={backdropCloseEvent === "mouseDown" ? onClose : undefined}
        />
      ) : null}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledBy ? undefined : ariaLabel ?? "Dialog"}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        className={`${contentClasses} ${className}`}
        onClick={(event) => event.stopPropagation()}
      >
        {showCloseButton ? (
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className={`absolute right-3 top-3 z-999 flex h-9.5 w-9.5 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white sm:right-6 sm:top-6 sm:h-11 sm:w-11 ${ADMIN_FOCUS_RING}`}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.04289 16.5413C5.65237 16.9318 5.65237 17.565 6.04289 17.9555C6.43342 18.346 7.06658 18.346 7.45711 17.9555L11.9987 13.4139L16.5408 17.956C16.9313 18.3466 17.5645 18.3466 17.955 17.956C18.3455 17.5655 18.3455 16.9323 17.955 16.5418L13.4129 11.9997L17.955 7.4576C18.3455 7.06707 18.3455 6.43391 17.955 6.04338C17.5645 5.65286 16.9313 5.65286 16.5408 6.04338L11.9987 10.5855L7.45711 6.0439C7.06658 5.65338 6.43342 5.65338 6.04289 6.0439C5.65237 6.43442 5.65237 7.06759 6.04289 7.45811L10.5845 11.9997L6.04289 16.5413Z"
                fill="currentColor"
              />
            </svg>
          </button>
        ) : null}
        <div>{children}</div>
      </div>
    </div>
  );
};
