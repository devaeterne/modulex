import React, { ReactNode } from "react";

type TableVariant = "plain" | "admin";
type TableMinWidth = "standard" | "medium" | "wide" | "extraWide";

const TABLE_MIN_WIDTHS: Record<TableMinWidth, string> = {
  standard: "max(100%, 960px)",
  medium: "max(100%, 1040px)",
  wide: "max(100%, 1120px)",
  extraWide: "max(100%, 1520px)",
};

interface TableViewportProps {
  children: ReactNode;
  className?: string;
}

interface TableProps {
  children: ReactNode;
  className?: string;
  variant?: TableVariant;
  minWidth?: TableMinWidth;
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
  "aria-busy"?: React.AriaAttributes["aria-busy"];
}

interface TableRowProps {
  children: ReactNode;
  className?: string;
  variant?: TableVariant;
  title?: string;
  onDoubleClick?: React.MouseEventHandler<HTMLTableRowElement>;
}

interface TableCellProps {
  children: ReactNode;
  isHeader?: boolean;
  className?: string;
  variant?: TableVariant;
  colSpan?: number;
}

interface TableStateRowProps {
  children: ReactNode;
  colSpan: number;
  className?: string;
  variant?: TableVariant;
}

const TableViewport: React.FC<TableViewportProps> = ({ children, className = "" }) => (
  <div
    className={`w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-gray-200 [scrollbar-gutter:stable] dark:border-gray-800 ${className}`}
  >
    {children}
  </div>
);

const Table: React.FC<TableProps> = ({
  children,
  className = "",
  variant = "plain",
  minWidth,
}) => {
  const variantClass =
    variant === "admin" ? "divide-y divide-gray-200 dark:divide-gray-800" : "";

  return (
    <table
      className={`w-full min-w-full ${variantClass} ${className}`}
      style={minWidth ? { minWidth: TABLE_MIN_WIDTHS[minWidth] } : undefined}
    >
      {children}
    </table>
  );
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
  "aria-busy": ariaBusy,
}) => {
  const variantClass =
    variant === "admin"
      ? "divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-transparent"
      : "";
  return (
    <tbody aria-busy={ariaBusy} className={`${variantClass} ${className}`}>
      {children}
    </tbody>
  );
};

const TableRow: React.FC<TableRowProps> = ({
  children,
  className = "",
  title,
  onDoubleClick,
}) => {
  return (
    <tr className={className} title={title} onDoubleClick={onDoubleClick}>
      {children}
    </tr>
  );
};

const TableCell: React.FC<TableCellProps> = ({
  children,
  isHeader = false,
  className = "",
  variant = "plain",
  colSpan,
}) => {
  const CellTag = isHeader ? "th" : "td";
  const variantClass =
    variant === "admin"
      ? isHeader
        ? "px-5 py-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
        : "px-5 py-4 text-sm text-gray-700 dark:text-gray-300"
      : "";

  return (
    <CellTag colSpan={colSpan} className={`${variantClass} ${className}`}>
      {children}
    </CellTag>
  );
};

const TableStateRow: React.FC<TableStateRowProps> = ({
  children,
  colSpan,
  className = "",
  variant = "admin",
}) => (
  <TableRow>
    <TableCell
      colSpan={colSpan}
      variant={variant}
      className={`py-8 text-center text-gray-500 dark:text-gray-400 ${className}`}
    >
      {children}
    </TableCell>
  </TableRow>
);

/**
 * Behavior-preserving native-compatible adapters for mechanical strict migrations.
 * They intentionally add no variants or styling; feature appearance remains owned
 * by shared theme tokens while existing DOM/event semantics stay unchanged.
 */
export const TableNative = React.forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement>
>(function TableNative(props, ref) {
  return <table ref={ref} {...props} />;
});

export const TableHeaderNative = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(function TableHeaderNative(props, ref) {
  return <thead ref={ref} {...props} />;
});

export const TableBodyNative = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(function TableBodyNative(props, ref) {
  return <tbody ref={ref} {...props} />;
});

export const TableRowNative = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(function TableRowNative(props, ref) {
  return <tr ref={ref} {...props} />;
});

export const TableHeaderCellNative = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(function TableHeaderCellNative(props, ref) {
  return <th ref={ref} {...props} />;
});

export const TableCellNative = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(function TableCellNative(props, ref) {
  return <td ref={ref} {...props} />;
});

export {
  TableViewport,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableStateRow,
};
