import type { ReactNode } from "react";

type SummaryRowProps = {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  divider?: boolean;
};

export default function SummaryRow({ label, value, strong = false, divider = false }: SummaryRowProps) {
  return (
    <div className={`flex items-center justify-between gap-4 ${divider ? "border-t border-gray-100 pt-3 dark:border-gray-800" : ""}`}>
      <span className={strong ? "text-sm font-semibold text-gray-800 dark:text-white/90" : "text-sm text-gray-500 dark:text-gray-400"}>
        {label}
      </span>
      <span className={strong ? "text-lg font-semibold text-gray-900 dark:text-white" : "text-sm font-medium text-gray-800 dark:text-white/90"}>
        {value}
      </span>
    </div>
  );
}
