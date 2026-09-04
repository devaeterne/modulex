import React from "react";
import { ADMIN_SURFACE_CARD } from "@/components/ui/theme/adminTheme";

interface ComponentCardProps {
  title: string;
  children?: React.ReactNode;
  className?: string;
  desc?: string;
  headerAction?: React.ReactNode;
  collapsed?: boolean;
}

const ComponentCard: React.FC<ComponentCardProps> = ({
  title,
  children,
  className = "",
  desc = "",
  headerAction,
  collapsed = false,
}) => {
  return (
    <section className={`${ADMIN_SURFACE_CARD} ${className}`}>
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <div className="min-w-0">
          <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
            {title}
          </h3>
          {desc ? (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {desc}
            </p>
          ) : null}
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>

      {!collapsed && children ? (
        <div className="border-t border-gray-100 p-4 dark:border-gray-800 sm:p-6">
          <div className="space-y-6">{children}</div>
        </div>
      ) : null}
    </section>
  );
};

export default ComponentCard;
