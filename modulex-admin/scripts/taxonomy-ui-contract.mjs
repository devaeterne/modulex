import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const manager = read("src/components/products/TaxonomyManager.tsx");

for (const component of [
  "ComponentCard",
  "Label",
  "InputField",
  "Button",
  "Badge",
  "Alert",
  "Modal",
  "TableViewport",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
]) {
  expect(manager.includes(component), `TaxonomyManager must use shared ${component}`);
}

expect(
  !/<(?:input|button|table|thead|tbody|tr|th|td)\b/.test(manager),
  "TaxonomyManager must not reimplement shared TailAdmin primitives"
);
expect(
  !manager.includes("fixed inset-0") && manager.includes("<Modal"),
  "Taxonomy delete confirmation must use the shared Modal"
);
expect(
  manager.includes("closeOnEscape={false}") &&
    manager.includes('backdropCloseEvent="mouseDown"'),
  "Taxonomy delete confirmation must preserve its pre-refactor Escape and backdrop semantics"
);
expect(
  manager.includes("onClose={() => setPendingDelete(null)}") &&
    !manager.includes("function closeDeleteModal()"),
  "Taxonomy delete confirmation must preserve its pre-refactor close behavior while saving"
);
expect(
  !/<Button[^>]+disabled=\{savingId === pendingDelete\.id\}[^>]*>Cancel<\/Button>/.test(manager),
  "Taxonomy Cancel must preserve its pre-refactor availability while saving"
);
expect(
  manager.includes('variant="admin"') && manager.includes("<TableViewport>"),
  "Taxonomy directory must use the shared admin table pattern"
);
expect(
  manager.includes('htmlFor={`${tableName}-search`}') &&
    manager.includes('id={`${tableName}-search`}') &&
    manager.includes('htmlFor={`${tableName}-new`}') &&
    manager.includes('id={`${tableName}-new`}'),
  "Taxonomy fields must preserve accessible label relationships"
);

console.log("taxonomy UI contract: ok");
