import fs from "node:fs";

const file = "modulex-admin/src/components/products/ProductMasterReferenceManager.tsx";
let source = fs.readFileSync(file, "utf8");

function replaceOnce(label, before, after) {
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one source match, found ${count}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  "TableStateRow import",
  `  TableRow,\n  TableViewport,`,
  `  TableRow,\n  TableStateRow,\n  TableViewport,`,
);

replaceOnce(
  "shared table min width",
  `<Table\n              variant="admin"\n              className={kind === "product_types" ? "min-w-[1280px]" : "min-w-[760px]"}\n            >`,
  `<Table\n              variant="admin"\n              minWidth={kind === "product_types" ? "extraWide" : "standard"}\n            >`,
);

replaceOnce(
  "shared empty state row",
  `<TableRow>\n                    <TableCell variant="admin" colSpan={columnCount} className="text-center">\n                      No {title.toLowerCase()} match the current filters.\n                    </TableCell>\n                  </TableRow>`,
  `<TableStateRow colSpan={columnCount}>\n                    No {title.toLowerCase()} match the current filters.\n                  </TableStateRow>`,
);

fs.writeFileSync(file, source);
console.log("UI-2D product reference transform complete");
