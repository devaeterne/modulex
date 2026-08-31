import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const form = read("src/components/products/ProductForm.tsx");
const textArea = read("src/components/form/input/TextArea.tsx");

for (const id of [
  "product-brand",
  "product-category",
  "product-type",
  "product-uom",
  "stone-type",
  "material-price-band",
  "product-status",
]) {
  expect(
    form.includes(`htmlFor="${id}"`) && form.includes(`id="${id}"`),
    `ProductForm field ${id} must have an explicit accessible label`
  );
}

expect(
  form.includes('htmlFor="product-description"') &&
    form.includes('id="product-description"'),
  "Product description must have an explicit accessible label"
);
expect(
  /id\?:\s*string/.test(textArea) && /<textarea[\s\S]*?id=\{id\}/.test(textArea),
  "Shared TextArea must pass its optional id to the native textarea"
);
expect(
  /<dt className="[^"]*text-gray-[^"]*dark:text-[^"]*"/.test(form) &&
    /<dd className="[^"]*text-gray-[^"]*dark:text-[^"]*"/.test(form),
  "Product QR details must use TailAdmin light and dark typography"
);

console.log("product form UI contract: ok");
