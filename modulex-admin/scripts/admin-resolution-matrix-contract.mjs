import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const viewportModulePath = "src/components/ui/responsive/adminViewport.ts";
expect(
  fs.existsSync(path.join(root, viewportModulePath)),
  "UI-2E requires a shared admin viewport matrix",
);

const viewport = read(viewportModulePath);
const requiredWidths = [360, 390, 768, 1024, 1280, 1366, 1440, 1536, 1920, 2560];
for (const width of requiredWidths) {
  expect(viewport.includes(String(width)), `Resolution matrix is missing ${width}px`);
}
expect(viewport.includes("ADMIN_DESKTOP_BREAKPOINT = 1024"), "Desktop breakpoint must remain aligned to Tailwind lg at 1024px");
expect(viewport.includes("width < ADMIN_DESKTOP_BREAKPOINT"), "Mobile viewport helper must derive from the shared desktop breakpoint");

const sidebarContext = read("src/context/SidebarContext.tsx");
const header = read("src/layout/AppHeader.tsx");
expect(sidebarContext.includes("isAdminMobileViewport"), "SidebarContext must use the shared viewport helper");
expect(header.includes("isAdminMobileViewport"), "AppHeader must use the shared viewport helper");
expect(!sidebarContext.includes("window.innerWidth < 1024"), "SidebarContext must not duplicate the 1024px breakpoint");
expect(!header.includes("window.innerWidth >= 1024"), "AppHeader must not duplicate the 1024px breakpoint");

const layout = read("src/app/(admin)/layout.tsx");
for (const token of ["min-w-0", "w-full p-4 md:p-6", "lg:ml-[290px]", "lg:ml-[90px]", '"ml-0"']) {
  expect(layout.includes(token), `Admin shell responsive token missing: ${token}`);
}

const sidebar = read("src/layout/AppSidebar.tsx");
for (const token of ["w-[290px]", "w-[90px]", "-translate-x-full", "translate-x-0", "lg:translate-x-0", "h-[calc(100dvh-4rem)]", "lg:h-screen"]) {
  expect(sidebar.includes(token), `Sidebar resolution behavior missing: ${token}`);
}

const headerCss = read("src/layout/AppHeader.module.css");
for (const token of ["right: 0.75rem", "left: 0.75rem", "width: auto !important", "max-height: calc(100dvh - 9.25rem)", "min-width: 640px", "max-width: 1023px", "min(400px, calc(100vw - 2.5rem))", "min-width: 1024px", "width: 400px !important"]) {
  expect(headerCss.includes(token), `Notification dropdown matrix guard missing: ${token}`);
}

const table = read("src/components/ui/table/index.tsx");
for (const token of ["min-w-0", "max-w-full", "overflow-x-auto", "overscroll-x-contain"]) {
  expect(table.includes(token), `Table viewport must contain intentional horizontal overflow: ${token}`);
}

const modal = read("src/components/ui/modal/index.tsx");
expect(modal.includes("fixed inset-0") && modal.includes("overflow-y-auto"), "Modal overlay must stay viewport-contained and vertically scrollable");
expect(modal.includes("w-full"), "Shared modal surface must be able to shrink to the viewport width");

const userDropdown = read("src/components/header/UserDropdown.tsx");
expect(userDropdown.includes("w-[290px]"), "User menu width must remain below the 360px minimum matrix width");
expect(userDropdown.includes("hidden min-w-0 sm:block"), "User trigger details must collapse below sm widths");

const guide = read("docs/ADMIN_UI_GUIDE.md");
expect(guide.includes("UI-2E"), "Admin UI guide must document UI-2E resolution ownership");
expect(guide.includes("360") && guide.includes("2560"), "Admin UI guide must document the supported resolution endpoints");

const tracker = read("AdminUICheck.md");
expect(tracker.includes("UI-2E — Resolution Matrix"), "Admin UI tracker must retain UI-2E section");
expect(/69\s+sidebar\s+routes/i.test(tracker) && /23\s+nested[\s\S]{0,80}routes/i.test(tracker), "Tracker must record the completed UI-2D route inventory before UI-2E closeout");

console.log(`PASS: admin resolution matrix contract (${requiredWidths.length} widths: ${requiredWidths.join(", ")})`);
