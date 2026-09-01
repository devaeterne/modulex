import React from "react";
import {
  ADMIN_STATUS_TONES,
  type AdminStatusColor,
  type AdminStatusVariant,
} from "@/components/ui/theme/adminTheme";

type BadgeSize = "sm" | "md";

interface BadgeProps {
  variant?: AdminStatusVariant;
  size?: BadgeSize;
  color?: AdminStatusColor;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  children: React.ReactNode;
}

const Badge: React.FC<BadgeProps> = ({
  variant = "light",
  color = "primary",
  size = "md",
  startIcon,
  endIcon,
  children,
}) => {
  const baseStyles =
    "inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-0.5 font-medium";
  const sizeStyles = {
    sm: "text-theme-xs",
    md: "text-sm",
  };
  const colorStyles = ADMIN_STATUS_TONES[variant][color];

  return (
    <span className={`${baseStyles} ${sizeStyles[size]} ${colorStyles}`}>
      {startIcon ? <span className="flex items-center">{startIcon}</span> : null}
      {children}
      {endIcon ? <span className="flex items-center">{endIcon}</span> : null}
    </span>
  );
};

export default Badge;
