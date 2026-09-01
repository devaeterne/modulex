import React from "react";

type SectionTitleProps = {
  children: React.ReactNode;
};

export default function SectionTitle({ children }: SectionTitleProps) {
  return (
    <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
      {children}
    </h3>
  );
}
