import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const context = read("src/context/SidebarContext.tsx");
const header = read("src/layout/AppHeader.tsx");
const css = read("src/layout/AppHeader.module.css");
const notifications = read("src/components/header/NotificationDropdown.tsx");
const userDropdown = read("src/components/header/UserDropdown.tsx");
const workflow = read("../.github/workflows/admin-mobile-shell-ui.yml");

expect(context.includes("usePathname"), "Sidebar context must observe route changes");
expect(context.includes("window.innerWidth < 1024"), "Sidebar mobile breakpoint must match the lg header breakpoint");
expect(context.includes("setIsMobileOpen(false)") && context.includes("[pathname]"), "Mobile sidebar must close after route changes");
expect(context.includes("closeMobileSidebar"), "Sidebar context must expose an idempotent mobile close action");
expect(context.includes('target.closest("aside a[href]")'), "Mobile sidebar navigation links must close the drawer immediately on click");
expect(context.includes('document.addEventListener("click", handleSidebarNavigationClick)'), "Mobile sidebar click-close behavior must be registered and cleaned up");
expect(context.includes("if (!isMobile) return"), "Sidebar link clicks must not alter desktop expansion state");

expect(header.includes('import styles from "./AppHeader.module.css"'), "Header must scope mobile notification layout styles");
expect(header.includes("usePathname") && header.includes("setApplicationMenuOpen(false)"), "Mobile application menu must close after navigation");
expect(header.includes("styles.mobileNotification"), "Notification dropdown must use the viewport-safe wrapper");
expect(header.includes("window.innerWidth >= 1024") && header.includes("toggleSidebar()") && header.includes("toggleMobileSidebar()"), "Header toggle must keep desktop and mobile sidebar behavior separate");
expect(header.includes("<ThemeToggleButton") && header.includes("<NotificationDropdown") && header.includes("<UserDropdown"), "Header must compose the shared theme, notification, and user controls");

expect(css.includes("position: fixed"), "Mobile notification panel must be viewport-positioned");
expect(css.includes("100dvh"), "Mobile notification panel must respect dynamic viewport height");
expect(css.includes("safe-area-inset-top"), "Mobile notification panel must respect safe-area inset");
expect(css.includes("@media (min-width: 1024px)"), "Desktop notification alignment must be restored at lg breakpoint");
expect(css.includes("position: absolute") && css.includes("right: 0"), "Desktop notification dropdown must remain trigger-aligned");

expect(notifications.includes("Notification settings") && notifications.includes("markAllAsRead"), "Notification behavior must remain intact while layout changes");
expect(notifications.includes('aria-expanded={isOpen}'), "Notification trigger must retain accessible expanded state");

expect(userDropdown.includes("Dropdown") && userDropdown.includes("DropdownItem"), "User menu must compose the shared dropdown primitives");
expect(userDropdown.includes("Badge"), "User role must use the shared Badge primitive");
expect(userDropdown.includes('aria-haspopup="menu"') && userDropdown.includes("aria-expanded={isOpen}"), "User menu trigger must expose menu expanded state");
expect(userDropdown.includes('href="/profile"'), "Profile navigation must remain available");
expect(userDropdown.includes("signOut()") && userDropdown.includes('window.location.replace("/signin")'), "Sign-out flow must remain intact");
expect(userDropdown.includes("disabled={isSigningOut}"), "Sign-out must retain its busy-state guard");
expect(userDropdown.includes("focus:ring-3") && userDropdown.includes("focus:ring-brand-500/10"), "User trigger focus treatment must match the TailAdmin header controls");
expect(workflow.includes('modulex-admin/src/components/header/UserDropdown.tsx'), "Mobile shell workflow must watch UserDropdown changes");

console.log("mobile shell UI contract: ok");
