export const ADMIN_FOCUS_RING =
  "focus-visible:outline-hidden focus-visible:ring-3 focus-visible:ring-brand-500/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-brand-400/25 dark:focus-visible:ring-offset-gray-900";

export const ADMIN_CONTROL_DISABLED =
  "disabled:cursor-not-allowed disabled:opacity-60";

export const ADMIN_FIELD_BASE =
  "h-11 w-full appearance-none rounded-lg border px-4 py-2.5 text-sm shadow-theme-xs transition-colors placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:bg-gray-900 dark:placeholder:text-white/30 dark:focus:border-brand-700";

export const ADMIN_FIELD_STATES = {
  default:
    "border-gray-300 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90",
  disabled:
    "border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed dark:border-gray-800 dark:bg-gray-800 dark:text-gray-400",
  error:
    "border-error-500 bg-white text-error-800 focus:border-error-500 focus:ring-error-500/10 dark:border-error-500 dark:bg-gray-900 dark:text-error-300",
  success:
    "border-success-400 bg-white text-success-700 focus:border-success-400 focus:ring-success-500/10 dark:border-success-500 dark:bg-gray-900 dark:text-success-300",
} as const;

export const ADMIN_BUTTON_VARIANTS = {
  primary:
    "bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300 dark:bg-brand-500 dark:hover:bg-brand-600 dark:disabled:bg-brand-500/40",
  outline:
    "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-800 dark:hover:text-white",
  danger:
    "bg-error-600 text-white shadow-theme-xs hover:bg-error-700 disabled:bg-error-300 dark:bg-error-600 dark:hover:bg-error-500 dark:disabled:bg-error-900/50",
  ghost:
    "bg-transparent text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06] dark:hover:text-white",
} as const;

export const ADMIN_SURFACE_CARD =
  "overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900";

export const ADMIN_SURFACE_POPOVER =
  "rounded-xl border border-gray-200 bg-white shadow-theme-lg dark:border-gray-700 dark:bg-gray-900";

export const ADMIN_SURFACE_MODAL =
  "relative w-full rounded-3xl border border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-900";

export const ADMIN_STATUS_TONES = {
  light: {
    primary:
      "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
    success:
      "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
    error:
      "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-300",
    warning:
      "bg-warning-50 text-warning-800 dark:bg-warning-500/15 dark:text-warning-300",
    info:
      "bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-300",
    light:
      "bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-200",
    dark:
      "bg-gray-700 text-white dark:bg-gray-700 dark:text-gray-100",
  },
  solid: {
    primary: "bg-brand-600 text-white dark:bg-brand-500 dark:text-white",
    success: "bg-success-600 text-white dark:bg-success-600 dark:text-white",
    error: "bg-error-600 text-white dark:bg-error-600 dark:text-white",
    warning:
      "bg-warning-400 text-gray-950 dark:bg-warning-400 dark:text-gray-950",
    info:
      "bg-blue-light-600 text-white dark:bg-blue-light-600 dark:text-white",
    light:
      "bg-gray-400 text-gray-950 dark:bg-gray-600 dark:text-white",
    dark: "bg-gray-800 text-white dark:bg-gray-700 dark:text-white",
  },
} as const;

export const ADMIN_TEXT_STYLES = {
  body: "text-gray-700 dark:text-gray-300",
  strong: "text-gray-800 dark:text-white/90",
  muted: "text-gray-500 dark:text-gray-400",
} as const;

export const ADMIN_DOCUMENT_STYLES = {
  viewer: "bg-gray-100 transition-colors dark:bg-gray-950 print:bg-white",
  toolbar: "rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900",
  toolbarTitle: "text-gray-800 dark:text-white/90",
  toolbarMuted: "text-gray-500 dark:text-gray-400",
  toolbarError: "text-error-600 dark:text-error-400",
  loading: "bg-gray-100 text-gray-500 dark:bg-gray-950 dark:text-gray-400",
  loadError: "bg-gray-100 text-error-600 dark:bg-gray-950 dark:text-error-400",
  sheet: "bg-white text-gray-900 shadow-xl shadow-gray-900/10 ring-1 ring-gray-200 dark:bg-white dark:text-gray-900 dark:ring-gray-700 print:ring-0",
  borderStrong: "border-gray-300",
  borderSoft: "border-gray-200",
  companyText: "text-gray-700",
  companyStrong: "text-gray-900",
  logoFallback: "text-gray-800",
  kicker: "text-gray-500",
  title: "text-gray-950",
  meta: "text-gray-600",
  metaLabel: "text-gray-800",
  partyText: "text-gray-700",
  infoStrong: "text-gray-900",
  tableHead: "border-gray-300 text-gray-500",
  tableRow: "border-gray-200",
  lineNo: "text-gray-500",
  sku: "text-gray-900",
  description: "text-gray-800",
  detail: "text-gray-500",
  numeric: "text-gray-700",
  lineTotal: "text-gray-950",
  totalsStrong: "border-gray-900 text-gray-950",
  totalsRegular: "text-gray-700",
  totalsValue: "text-gray-900",
  noteText: "text-gray-700",
  footerText: "text-gray-500",
  signatureText: "text-gray-600",
  signatureBorder: "border-gray-500",
} as const;

export const ADMIN_BRANDING_STYLES = {
  loading: "rounded-2xl border border-gray-200 bg-white text-gray-500 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400",
  card: "rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900",
  heading: "text-gray-800 dark:text-white/90",
  muted: "text-gray-500 dark:text-gray-400",
  error: "rounded-xl border border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300",
  success: "rounded-xl border border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300",
  slot: "rounded-2xl border border-gray-200 dark:border-gray-800",
  previewLight: "bg-white",
  previewDark: "bg-gray-950",
  emptyLight: "text-gray-400",
  emptyDark: "text-gray-600",
  slotBody: "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/80",
  slotTitle: "text-gray-800 dark:text-white/90",
  contextBadge: "rounded-full bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  primaryBadge: "rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300",
  secondaryBadge: "rounded-full bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  legacyBadge: "rounded-full bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300",
  description: "text-gray-500 dark:text-gray-400",
  readonly: "text-gray-500 dark:text-gray-400",
} as const;

/**
 * Shared ownership for appearance that must remain byte-for-byte compatible while
 * legacy feature surfaces are mechanically migrated to the strict Admin UI contract.
 * New feature UI should prefer the semantic primitives/tokens above.
 */
export const ADMIN_COMPAT_APPEARANCE = {
  "bg-brand-50": "bg-brand-50",
  "bg-brand-500": "bg-brand-500",
  "bg-error-50": "bg-error-50",
  "bg-gray-100": "bg-gray-100",
  "bg-gray-200": "bg-gray-200",
  "bg-gray-50": "bg-gray-50",
  "bg-none": "bg-none",
  "bg-success-50": "bg-success-50",
  "bg-success-600": "bg-success-600",
  "bg-transparent": "bg-transparent",
  "bg-warning-50": "bg-warning-50",
  "bg-warning-500": "bg-warning-500",
  "bg-white": "bg-white",
  "border-brand-100": "border-brand-100",
  "border-brand-500": "border-brand-500",
  "border-error-200": "border-error-200",
  "border-error-300": "border-error-300",
  "border-gray-100": "border-gray-100",
  "border-gray-200": "border-gray-200",
  "border-gray-300": "border-gray-300",
  "border-success-200": "border-success-200",
  "border-t-brand-500": "border-t-brand-500",
  "border-t-transparent": "border-t-transparent",
  "border-warning-200": "border-warning-200",
  "dark:bg-brand-500/10": "dark:bg-brand-500/10",
  "dark:bg-dark-900": "dark:bg-dark-900",
  "dark:bg-error-500/10": "dark:bg-error-500/10",
  "dark:bg-gray-800": "dark:bg-gray-800",
  "dark:bg-gray-900": "dark:bg-gray-900",
  "dark:bg-gray-900/40": "dark:bg-gray-900/40",
  "dark:bg-gray-950": "dark:bg-gray-950",
  "dark:bg-success-500/10": "dark:bg-success-500/10",
  "dark:bg-transparent": "dark:bg-transparent",
  "dark:bg-warning-500/10": "dark:bg-warning-500/10",
  "dark:bg-white/10": "dark:bg-white/10",
  "dark:bg-white/[0.02]": "dark:bg-white/[0.02]",
  "dark:bg-white/[0.03]": "dark:bg-white/[0.03]",
  "dark:bg-white/[0.04]": "dark:bg-white/[0.04]",
  "dark:border-error-500/30": "dark:border-error-500/30",
  "dark:border-error-500/40": "dark:border-error-500/40",
  "dark:border-error-800": "dark:border-error-800",
  "dark:border-gray-700": "dark:border-gray-700",
  "dark:border-gray-800": "dark:border-gray-800",
  "dark:border-success-500/30": "dark:border-success-500/30",
  "dark:border-warning-500/30": "dark:border-warning-500/30",
  "dark:divide-gray-800": "dark:divide-gray-800",
  "dark:fill-brand-500/10": "dark:fill-brand-500/10",
  "dark:focus-visible:ring-offset-gray-900": "dark:focus-visible:ring-offset-gray-900",
  "dark:focus:border-brand-800": "dark:focus:border-brand-800",
  "dark:hover:bg-error-500/10": "dark:hover:bg-error-500/10",
  "dark:hover:bg-white/[0.02]": "dark:hover:bg-white/[0.02]",
  "dark:hover:bg-white/[0.03]": "dark:hover:bg-white/[0.03]",
  "dark:hover:bg-white/[0.05]": "dark:hover:bg-white/[0.05]",
  "dark:hover:text-brand-300": "dark:hover:text-brand-300",
  "dark:hover:text-brand-400": "dark:hover:text-brand-400",
  "dark:hover:text-white": "dark:hover:text-white",
  "dark:placeholder:text-white/30": "dark:placeholder:text-white/30",
  "dark:text-brand-400": "dark:text-brand-400",
  "dark:text-error-300": "dark:text-error-300",
  "dark:text-error-400": "dark:text-error-400",
  "dark:text-gray-200": "dark:text-gray-200",
  "dark:text-gray-300": "dark:text-gray-300",
  "dark:text-gray-400": "dark:text-gray-400",
  "dark:text-gray-500": "dark:text-gray-500",
  "dark:text-success-400": "dark:text-success-400",
  "dark:text-warning-300": "dark:text-warning-300",
  "dark:text-warning-400": "dark:text-warning-400",
  "dark:text-white": "dark:text-white",
  "dark:text-white/90": "dark:text-white/90",
  "file:bg-brand-50": "file:bg-brand-50",
  "file:rounded-lg": "file:rounded-lg",
  "file:text-brand-700": "file:text-brand-700",
  "focus-visible:ring-2": "focus-visible:ring-2",
  "focus-visible:ring-brand-500": "focus-visible:ring-brand-500",
  "focus-visible:ring-brand-500/40": "focus-visible:ring-brand-500/40",
  "focus-visible:ring-offset-2": "focus-visible:ring-offset-2",
  "focus:border-brand-300": "focus:border-brand-300",
  "focus:ring-3": "focus:ring-3",
  "focus:ring-brand-500/10": "focus:ring-brand-500/10",
  "focus:ring-brand-500/20": "focus:ring-brand-500/20",
  "hover:bg-brand-600": "hover:bg-brand-600",
  "hover:bg-error-50": "hover:bg-error-50",
  "hover:bg-gray-50": "hover:bg-gray-50",
  "hover:bg-success-700": "hover:bg-success-700",
  "hover:bg-warning-600": "hover:bg-warning-600",
  "hover:text-brand-600": "hover:text-brand-600",
  "hover:text-brand-700": "hover:text-brand-700",
  "hover:text-gray-800": "hover:text-gray-800",
  "placeholder:text-gray-400": "placeholder:text-gray-400",
  rounded: "rounded",
  "rounded-2xl": "rounded-2xl",
  "rounded-full": "rounded-full",
  "rounded-lg": "rounded-lg",
  "rounded-md": "rounded-md",
  "rounded-sm": "rounded-sm",
  "rounded-xl": "rounded-xl",
  "shadow-theme-xs": "shadow-theme-xs",
  "text-[10px]": "text-[10px]",
  "text-[11px]": "text-[11px]",
  "text-brand-500": "text-brand-500",
  "text-brand-600": "text-brand-600",
  "text-brand-700": "text-brand-700",
  "text-error-500": "text-error-500",
  "text-error-600": "text-error-600",
  "text-error-700": "text-error-700",
  "text-gray-400": "text-gray-400",
  "text-gray-500": "text-gray-500",
  "text-gray-600": "text-gray-600",
  "text-gray-700": "text-gray-700",
  "text-gray-800": "text-gray-800",
  "text-gray-900": "text-gray-900",
  "text-success-600": "text-success-600",
  "text-success-700": "text-success-700",
  "text-warning-600": "text-warning-600",
  "text-warning-700": "text-warning-700",
  "text-warning-800": "text-warning-800",
  "text-white": "text-white",
} as const;

export type AdminButtonVariant = keyof typeof ADMIN_BUTTON_VARIANTS;
export type AdminStatusVariant = keyof typeof ADMIN_STATUS_TONES;
export type AdminStatusColor = keyof (typeof ADMIN_STATUS_TONES)["light"];
