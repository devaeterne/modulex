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

console.log("product reference UI contract: ok");
