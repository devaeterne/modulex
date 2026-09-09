import React from "react";

type ProgressBarProps = {
  value: number;
  max?: number;
  label?: string;
};

export default function ProgressBar({ value, max = 100, label }: ProgressBarProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;
  const percentage = (safeValue / safeMax) * 100;

  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
    >
      <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${percentage}%` }} />
    </div>
  );
}
