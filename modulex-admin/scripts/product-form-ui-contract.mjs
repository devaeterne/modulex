import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const readOptional = (file) => {
  try {
    return read(file);
  } catch {
    return "";
  }
};
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const form = read("src/components/products/ProductForm.tsx");
const textArea = read("src/components/form/input/TextArea.tsx");
const editPage = read("src/app/(admin)/products/[id]/edit/page.tsx");
const mediaPanel = readOptional("src/components/products/ProductMediaPanel.tsx");

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

expect(
  editPage.includes('ProductMediaPanel') && editPage.includes('<ProductMediaPanel productId={id} />'),
  "Product edit/detail page must render the canonical product media panel"
);
expect(mediaPanel.length > 0, "ProductMediaPanel must exist");
expect(
  mediaPanel.includes('.from("products")') && mediaPanel.includes('base_product_code'),
  "Product media must resolve the canonical product family from Product Master"
);
expect(
  mediaPanel.includes('.from("store_product_content")') &&
    mediaPanel.includes('.from("store_product_media")'),
  "Product media must read the media already attached during vendor approval"
);
expect(
  mediaPanel.includes('storage_bucket') && mediaPanel.includes('storage_path') && mediaPanel.includes('is_primary'),
  "Product media panel must surface Storage provenance and primary-image state"
);

console.log("product form UI contract: ok");
