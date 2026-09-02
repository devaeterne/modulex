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

export type AdminButtonVariant = keyof typeof ADMIN_BUTTON_VARIANTS;
export type AdminStatusVariant = keyof typeof ADMIN_STATUS_TONES;
export type AdminStatusColor = keyof (typeof ADMIN_STATUS_TONES)["light"];
