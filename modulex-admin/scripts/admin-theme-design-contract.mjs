import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const themePath = "src/components/ui/theme/adminTheme.ts";
expect(
  fs.existsSync(path.join(root, themePath)),
  "UI-2C requires a shared Admin theme/design token module",
);

const theme = read(themePath);
for (const token of [
  "ADMIN_FOCUS_RING",
  "ADMIN_FIELD_BASE",
  "ADMIN_FIELD_STATES",
  "ADMIN_BUTTON_VARIANTS",
  "ADMIN_SURFACE_CARD",
  "ADMIN_SURFACE_POPOVER",
  "ADMIN_SURFACE_MODAL",
  "ADMIN_STATUS_TONES",
]) {
  expect(theme.includes(`export const ${token}`), `Shared Admin theme must export ${token}`);
}
expect(theme.includes("dark:"), "Shared Admin theme tokens must define dark-mode behavior");
expect(theme.includes("focus-visible:"), "Shared Admin theme tokens must own keyboard focus treatment");

const button = read("src/components/ui/button/Button.tsx");
expect(button.includes("ADMIN_BUTTON_VARIANTS"), "Button must consume shared semantic button tokens");
expect(button.includes('"danger"') && button.includes('"ghost"'), "Button must expose danger and ghost semantic variants");
expect(button.includes("ADMIN_FOCUS_RING"), "Button must consume the shared focus ring");

const badge = read("src/components/ui/badge/Badge.tsx");
expect(badge.includes("ADMIN_STATUS_TONES"), "Badge must consume shared semantic status tones");
expect(!badge.includes("dark:text-orange-400"), "Badge warning state must not drift to an unrelated orange token");

const input = read("src/components/form/input/InputField.tsx");
expect(input.includes("ADMIN_FIELD_BASE"), "Input must consume the shared field base token");
expect(input.includes("ADMIN_FIELD_STATES"), "Input validation states must come from shared field tokens");
expect(input.includes("aria-describedby"), "Input hint/error text must be associated through aria-describedby");
expect(input.includes("dark:text-"), "Input hint states must remain readable in dark mode");

const select = read("src/components/form/Select.tsx");
expect(select.includes("ADMIN_FIELD_BASE"), "Select must consume the shared field base token");
expect(select.includes("ADMIN_FOCUS_RING"), "Select must consume the shared focus ring");

const checkbox = read("src/components/form/input/Checkbox.tsx");
expect(checkbox.includes("ADMIN_FOCUS_RING"), "Checkbox must expose the shared keyboard focus treatment");
expect(!checkbox.includes('stroke="#E4E7EC"'), "Checkbox must not hardcode a theme color in SVG state");

const switchSource = read("src/components/form/switch/Switch.tsx");
expect(switchSource.includes('<button'), "Switch must use a native keyboard-operable button");
expect(switchSource.includes('role="switch"'), "Switch must expose role=switch");
expect(switchSource.includes("aria-checked"), "Switch must expose aria-checked state");
expect(switchSource.includes("ADMIN_FOCUS_RING"), "Switch must expose the shared keyboard focus treatment");

const dropdown = read("src/components/ui/dropdown/Dropdown.tsx");
const dropdownItem = read("src/components/ui/dropdown/DropdownItem.tsx");
expect(dropdown.includes('event.key === "Escape"'), "Dropdown must close on Escape");
expect(dropdownItem.includes("ADMIN_FOCUS_RING"), "DropdownItem must expose shared keyboard focus treatment");
expect(dropdownItem.includes("dark:"), "DropdownItem default appearance must define dark mode");
expect(dropdownItem.includes('type="button"'), "DropdownItem button must not submit surrounding forms");

const modal = read("src/components/ui/modal/index.tsx");
expect(modal.includes('role="dialog"'), "Modal must expose dialog semantics");
expect(modal.includes('aria-modal="true"'), "Modal must expose aria-modal=true");
expect(modal.includes("previousActiveElement"), "Modal must restore focus to the opener on close");
expect(modal.includes("ADMIN_SURFACE_MODAL"), "Modal must consume shared surface tokens");
expect(modal.includes("ADMIN_FOCUS_RING"), "Modal close control must expose shared keyboard focus treatment");

const card = read("src/components/common/ComponentCard.tsx");
expect(card.includes("ADMIN_SURFACE_CARD"), "ComponentCard must consume shared card surface tokens");

console.log("PASS: admin theme and design token contract");
