import type { ReactNode } from "react";

type SummaryRowProps = {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
};

export default function SummaryRow({ label, value, strong = false }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={strong ? "text-sm font-semibold text-gray-800 dark:text-white/90" : "text-sm text-gray-500 dark:text-gray-400"}>
        {label}
      </span>
      <span className={strong ? "text-lg font-semibold text-gray-900 dark:text-white" : "text-sm font-medium text-gray-800 dark:text-white/90"}>
        {value}
      </span>
    </div>
  );
}
