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

export type AdminButtonVariant = keyof typeof ADMIN_BUTTON_VARIANTS;
export type AdminStatusVariant = keyof typeof ADMIN_STATUS_TONES;
export type AdminStatusColor = keyof (typeof ADMIN_STATUS_TONES)["light"];
