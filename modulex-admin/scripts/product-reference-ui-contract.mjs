import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const page = read("src/app/(admin)/products/types/page.tsx");
const manager = read("src/components/products/ProductMasterReferenceManager.tsx");
const multiSelect = read("src/components/form/MultiSelect.tsx");
const select = read("src/components/form/Select.tsx");

expect(
  page.includes('<ProductMasterReferenceManager kind="product_types" />'),
  "Product Types route must use the canonical reference manager for list, add and edit flows"
);
expect(
  manager.includes('"Add Product Type"') && manager.includes('"Edit Product Type"'),
  "Product Types must keep both add and edit states in the canonical editor"
);

for (const id of [
  "reference-status",
  "product-type-pricing-filter",
  "product-type-inventory-filter",
  "uom-quantity-filter",
  "product-type-description",
  "product-type-default-uom",
  "product-type-pricing-model",
]) {
  expect(
    manager.includes(`htmlFor="${id}"`) && manager.includes(`id="${id}"`),
    `${id} must have an explicit accessible label`
  );
}

expect(
  select.includes('className="relative w-full"') &&
    select.includes('pointer-events-none absolute right-3 top-1/2'),
  "Product Type single-select controls must inherit the canonical shared dropdown indicator"
);
expect(
  multiSelect.includes('import Label from "@/components/form/Label"') &&
    multiSelect.includes("ADMIN_FIELD_BASE") &&
    multiSelect.includes("ADMIN_FIELD_STATES") &&
    multiSelect.includes("ADMIN_SURFACE_POPOVER"),
  "Allowed Units must use the shared Admin field, label and popover appearance contract"
);
expect(
  multiSelect.includes('aria-haspopup="listbox"') &&
    multiSelect.includes("aria-expanded={isOpen}") &&
    multiSelect.includes('role="listbox"') &&
    multiSelect.includes('role="option"') &&
    multiSelect.includes("aria-selected={isSelected}"),
  "Allowed Units dropdown must expose listbox semantics and selection state"
);
expect(
  multiSelect.includes('event.key === "Escape"') &&
    multiSelect.includes("setIsOpen(false)"),
  "Allowed Units dropdown must close on Escape"
);
expect(
  multiSelect.includes("triggerRef") &&
    multiSelect.includes("rootRef") &&
    multiSelect.includes("contains(event.target as Node)"),
  "Allowed Units dropdown must restore focus behavior and close when clicking outside"
);
expect(
  !multiSelect.includes('<div onClick={toggleDropdown}') &&
    !multiSelect.includes('value="Select option"'),
  "Allowed Units must not double-toggle from nested click handlers or fake its placeholder with an input"
);
expect(
  !multiSelect.includes("primary"),
  "MultiSelect must not use undefined primary tokens"
);

expect(
  !/<small(?:>|\s+(?!className=))/.test(manager) &&
    manager.includes("text-gray-500 dark:text-gray-400"),
  "Product reference helper text must keep explicit light and dark typography until migrated to a shared hint primitive"
);

expect(
  manager.includes('className="m-4 max-w-[960px] overflow-hidden"'),
  "Product reference editor must keep the modal shell clipped to one viewport surface"
);
expect(
  manager.includes("shrink-0 border-b") && manager.includes("shrink-0 border-t"),
  "Product reference editor must keep a fixed header and footer around the scrollable form body"
);
expect(
  manager.includes("min-h-0 flex-1 overflow-y-auto"),
  "Product reference editor must scroll only the form body"
);
expect(
  !manager.includes('className="max-h-[88vh] overflow-y-auto p-4 sm:p-6"'),
  "Product reference editor must not use the legacy nested full-content scroll surface"
);

console.log("product reference UI contract: ok");
