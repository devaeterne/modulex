import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const manager = read("src/components/products/ProductMasterReferenceManager.tsx");
const multiSelect = read("src/components/form/MultiSelect.tsx");

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

expect(!multiSelect.includes("primary"), "MultiSelect must not use undefined primary tokens");
expect(
  multiSelect.includes('"bg-brand-50/60 dark:bg-brand-500/10"') &&
    multiSelect.includes('"hover:bg-gray-50 dark:hover:bg-white/[0.02]"'),
  "MultiSelect options must use the established TailAdmin selected and hover pattern"
);
expect(
  !/<small(?:>|\s+(?!className=))/.test(manager) &&
    manager.includes("text-gray-500 dark:text-gray-400"),
  "Product reference helper text must use TailAdmin light and dark typography"
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
