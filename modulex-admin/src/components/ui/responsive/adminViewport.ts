export const ADMIN_RESOLUTION_MATRIX = [
  360,
  390,
  768,
  1024,
  1280,
  1366,
  1440,
  1536,
  1920,
  2560,
] as const;

export const ADMIN_DESKTOP_BREAKPOINT = 1024;

export function isAdminMobileViewport(width: number) {
  return width < ADMIN_DESKTOP_BREAKPOINT;
}
