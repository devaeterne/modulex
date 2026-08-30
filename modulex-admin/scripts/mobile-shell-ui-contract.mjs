import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const context = read("src/context/SidebarContext.tsx");
const header = read("src/layout/AppHeader.tsx");
const css = read("src/layout/AppHeader.module.css");
const notifications = read("src/components/header/NotificationDropdown.tsx");

expect(context.includes("usePathname"), "Sidebar context must observe route changes");
expect(context.includes("window.innerWidth < 1024"), "Sidebar mobile breakpoint must match the lg header breakpoint");
expect(context.includes("setIsMobileOpen(false)") && context.includes("[pathname]"), "Mobile sidebar must close after route changes");
expect(context.includes("closeMobileSidebar"), "Sidebar context must expose an idempotent mobile close action");

expect(header.includes('import styles from "./AppHeader.module.css"'), "Header must scope mobile notification layout styles");
expect(header.includes("usePathname") && header.includes("setApplicationMenuOpen(false)"), "Mobile application menu must close after navigation");
expect(header.includes("styles.mobileNotification"), "Notification dropdown must use the viewport-safe wrapper");

expect(css.includes("position: fixed"), "Mobile notification panel must be viewport-positioned");
expect(css.includes("100dvh"), "Mobile notification panel must respect dynamic viewport height");
expect(css.includes("safe-area-inset-top"), "Mobile notification panel must respect safe-area inset");
expect(css.includes("@media (min-width: 1024px)"), "Desktop notification alignment must be restored at lg breakpoint");
expect(css.includes("position: absolute") && css.includes("right: 0"), "Desktop notification dropdown must remain trigger-aligned");

expect(notifications.includes("Notification settings") && notifications.includes("markAllAsRead"), "Notification behavior must remain intact while layout changes");
expect(notifications.includes('aria-expanded={isOpen}'), "Notification trigger must retain accessible expanded state");

console.log("mobile shell UI contract: ok");
