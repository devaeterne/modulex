import React from "react";

type StatTone = "neutral" | "brand" | "success" | "warning";

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  helper?: string;
  tone?: StatTone;
}

const toneClasses: Record<StatTone, string> = {
  neutral:
    "border-gray-200 bg-gray-50 text-gray-900 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90",
  brand:
    "border-brand-100 bg-brand-50 text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300",
  success:
    "border-success-100 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-400",
  warning:
    "border-warning-100 bg-warning-50 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-orange-300",
};

const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  helper,
  tone = "neutral",
}) => {
  return (
    <div className={`rounded-xl border p-4 ${toneClasses[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {helper ? <p className="mt-1 text-xs opacity-70">{helper}</p> : null}
    </div>
  );
};

export default StatTile;
