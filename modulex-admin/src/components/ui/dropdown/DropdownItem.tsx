import type React from "react";
import Link from "next/link";
import { ADMIN_FOCUS_RING } from "@/components/ui/theme/adminTheme";

interface DropdownItemProps {
  tag?: "a" | "button";
  href?: string;
  onClick?: () => void;
  onItemClick?: () => void;
  baseClassName?: string;
  className?: string;
  children: React.ReactNode;
}

export const DropdownItem: React.FC<DropdownItemProps> = ({
  tag = "button",
  href,
  onClick,
  onItemClick,
  baseClassName =
    "block w-full rounded-lg px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white",
  className = "",
  children,
}) => {
  const combinedClasses = `${baseClassName} ${ADMIN_FOCUS_RING} ${className}`.trim();

  const handleClick = (event: React.MouseEvent) => {
    if (tag === "button") event.preventDefault();
    onClick?.();
    onItemClick?.();
  };

  if (tag === "a" && href) {
    return (
      <Link href={href} className={combinedClasses} onClick={handleClick}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={handleClick} className={combinedClasses}>
      {children}
    </button>
  );
};
