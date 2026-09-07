import React, { ReactNode } from "react";
import {
  ADMIN_BUTTON_VARIANTS,
  ADMIN_CONTROL_DISABLED,
  ADMIN_FOCUS_RING,
  type AdminButtonVariant,
} from "@/components/ui/theme/adminTheme";

interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  size?: "sm" | "md";
  variant?: AdminButtonVariant;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  children,
  size = "md",
  variant = "primary",
  startIcon,
  endIcon,
  className = "",
  type = "button",
  disabled = false,
  ...buttonProps
}) => {
  const sizeClasses = {
    sm: "px-4 py-3 text-sm",
    md: "px-5 py-3.5 text-sm",
  };

  return (
    <button
      {...buttonProps}
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors ${ADMIN_FOCUS_RING} ${ADMIN_CONTROL_DISABLED} ${sizeClasses[size]} ${ADMIN_BUTTON_VARIANTS[variant]} ${className}`}
    >
      {startIcon ? <span className="flex items-center">{startIcon}</span> : null}
      {children}
      {endIcon ? <span className="flex items-center">{endIcon}</span> : null}
    </button>
  );
};

/**
 * Behavior-preserving adapter for strict migrations of legacy feature markup.
 * It intentionally adds no defaults or styling so native button semantics remain unchanged.
 */
export const ButtonNative = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function ButtonNative(props, ref) {
  return <button ref={ref} {...props} />;
});

export default Button;
