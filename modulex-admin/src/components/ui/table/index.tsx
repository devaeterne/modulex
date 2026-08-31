import React, { ReactNode } from "react";

type TableVariant = "plain" | "admin";

interface TableViewportProps {
  children: ReactNode;
  className?: string;
}

interface TableProps {
  children: ReactNode;
  className?: string;
  variant?: TableVariant;
}

interface TableHeaderProps {
  children: ReactNode;
  className?: string;
  variant?: TableVariant;
}

interface TableBodyProps {
  children: ReactNode;
  className?: string;
  variant?: TableVariant;
}

interface TableRowProps {
  children: ReactNode;
  className?: string;
  variant?: TableVariant;
}

interface TableCellProps {
  children: ReactNode;
  isHeader?: boolean;
  className?: string;
  variant?: TableVariant;
}

const TableViewport: React.FC<TableViewportProps> = ({ children, className = "" }) => (
  <div
    className={`w-full overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 ${className}`}
  >
    {children}
  </div>
);

const Table: React.FC<TableProps> = ({ children, className = "", variant = "plain" }) => {
  const variantClass =
    variant === "admin" ? "divide-y divide-gray-200 dark:divide-gray-800" : "";
  return <table className={`min-w-full ${variantClass} ${className}`}>{children}</table>;
};

const TableHeader: React.FC<TableHeaderProps> = ({
  children,
  className = "",
  variant = "plain",
}) => {
  const variantClass = variant === "admin" ? "bg-gray-50 dark:bg-gray-900/40" : "";
  return <thead className={`${variantClass} ${className}`}>{children}</thead>;
};

const TableBody: React.FC<TableBodyProps> = ({
  children,
  className = "",
  variant = "plain",
}) => {
  const variantClass =
    variant === "admin"
      ? "divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-transparent"
      : "";
  return <tbody className={`${variantClass} ${className}`}>{children}</tbody>;
};

const TableRow: React.FC<TableRowProps> = ({ children, className = "" }) => {
  return <tr className={className}>{children}</tr>;
};

const TableCell: React.FC<TableCellProps> = ({
  children,
  isHeader = false,
  className = "",
  variant = "plain",
}) => {
  const CellTag = isHeader ? "th" : "td";
  const variantClass =
    variant === "admin"
      ? isHeader
        ? "px-5 py-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
        : "px-5 py-4 text-sm text-gray-700 dark:text-gray-300"
      : "";

  return <CellTag className={`${variantClass} ${className}`}>{children}</CellTag>;
};

export { TableViewport, Table, TableHeader, TableBody, TableRow, TableCell };
