"use client";

import type React from "react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ADMIN_SURFACE_POPOVER } from "@/components/ui/theme/adminTheme";

interface DropdownProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  role?: React.AriaRole;
  ariaLabel?: string;
  portal?: boolean;
  anchorRef?: React.RefObject<HTMLElement | null>;
  offset?: number;
}

type PortalPosition = {
  top: number;
  right: number;
};

const MENU_ITEM_SELECTOR = [
  "[role='menuitem']:not([aria-disabled='true'])",
  "a[href]",
  "button:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export const Dropdown: React.FC<DropdownProps> = ({
  isOpen,
  onClose,
  children,
  className = "",
  role,
  ariaLabel,
  portal = false,
  anchorRef,
  offset = 8,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [portalPosition, setPortalPosition] = useState<PortalPosition | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const updatePortalPosition = useCallback(() => {
    if (!portal || !anchorRef?.current) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const menuHeight = dropdownRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - anchorRect.bottom - offset;
    const spaceAbove = anchorRect.top - offset;
    const shouldOpenUp = menuHeight > 0 && menuHeight > spaceBelow && spaceAbove > spaceBelow;
    const top = shouldOpenUp
      ? Math.max(8, anchorRect.top - menuHeight - offset)
      : Math.min(anchorRect.bottom + offset, Math.max(8, window.innerHeight - menuHeight - 8));

    setPortalPosition({
      top,
      right: Math.max(8, window.innerWidth - anchorRect.right),
    });
  }, [anchorRef, offset, portal]);

  useLayoutEffect(() => {
    if (!isOpen || !portal) return;
    updatePortalPosition();
  }, [isOpen, portal, updatePortalPosition]);

  useEffect(() => {
    if (!isOpen || !portal) return;

    const syncPosition = () => updatePortalPosition();
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [isOpen, portal, updatePortalPosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        !anchorRef?.current?.contains(target) &&
        !(event.target as HTMLElement).closest(".dropdown-toggle")
      ) {
        onCloseRef.current();
      }
    };

    const getItems = () => Array.from(
      dropdownRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? [],
    );

    const focusAt = (items: HTMLElement[], index: number) => {
      if (items.length === 0) return;
      items[(index + items.length) % items.length]?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        window.requestAnimationFrame(() => anchorRef?.current?.focus());
        return;
      }

      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = getItems();
      if (items.length === 0) return;
      event.preventDefault();
      const currentIndex = items.findIndex((item) => item === document.activeElement);

      if (event.key === "ArrowDown") {
        focusAt(items, currentIndex < 0 ? 0 : currentIndex + 1);
      } else if (event.key === "ArrowUp") {
        focusAt(items, currentIndex < 0 ? items.length - 1 : currentIndex - 1);
      } else if (event.key === "Home") {
        focusAt(items, 0);
      } else if (event.key === "End") {
        focusAt(items, items.length - 1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, isOpen]);

  if (!isOpen) return null;

  const dropdown = (
    <div
      ref={dropdownRef}
      role={role}
      aria-label={ariaLabel}
      style={portal && portalPosition ? { position: "fixed", top: portalPosition.top, right: portalPosition.right } : undefined}
      className={
        portal
          ? `z-99999 ${ADMIN_SURFACE_POPOVER} ${className}`
          : `absolute right-0 z-40 mt-2 ${ADMIN_SURFACE_POPOVER} ${className}`
      }
    >
      {children}
    </div>
  );

  if (portal && typeof document !== "undefined") {
    return createPortal(dropdown, document.body);
  }

  return dropdown;
};
