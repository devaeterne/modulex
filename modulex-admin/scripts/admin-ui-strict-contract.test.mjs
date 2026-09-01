import assert from "node:assert/strict";
import {
  auditSource,
  isAuditedFeaturePath,
  resolveChangedFiles,
} from "./admin-ui-strict-contract.mjs";

const goodFeature = `
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
export default function Good() {
  return <ComponentCard title="Example"><div className="grid gap-4 md:grid-cols-2"><Label htmlFor="name">Name</Label><Input id="name" /><Button>Save</Button></div></ComponentCard>;
}`;

assert.equal(auditSource("src/components/example/Good.tsx", goodFeature).length, 0);
assert.ok(auditSource("src/components/example/Bad.tsx", `export default () => <button>Save</button>`).some((v) => v.rule === "native-primitive"));
assert.ok(auditSource("src/components/example/Bad.tsx", `export default () => <div className="rounded-2xl bg-white text-gray-700 dark:bg-gray-900" />`).some((v) => v.rule === "route-appearance"));
assert.equal(auditSource("src/components/example/Layout.tsx", `export default () => <div className="grid gap-4 md:grid-cols-2 max-w-3xl text-sm font-medium" />`).length, 0);
assert.equal(isAuditedFeaturePath("src/components/ui/button/Fake.tsx"), false);
assert.equal(isAuditedFeaturePath("src/components/form/Label.tsx"), false);
assert.equal(isAuditedFeaturePath("src/components/common/ComponentCard.tsx"), false);
assert.equal(isAuditedFeaturePath("src/components/countertop/CountertopCatalogManager.tsx"), true);
assert.equal(isAuditedFeaturePath("src/layout/AppSidebar.tsx"), false);

const changed = resolveChangedFiles({
  explicitFiles: "modulex-admin/src/components/example/Good.tsx\nsrc/components/example/OnlyThis.tsx",
});
assert.deepEqual(changed, ["src/components/example/Good.tsx", "src/components/example/OnlyThis.tsx"]);

assert.ok(auditSource("src/app/(admin)/example/page.tsx", `export default function Page(){return <div />}`).some((v) => v.rule === "page-heading"));
assert.equal(auditSource("src/app/(admin)/example/page.tsx", `import PageBreadcrumb from "@/components/common/PageBreadCrumb"; export default function Page(){return <PageBreadcrumb pageTitle="Example" />}`).length, 0);
assert.ok(auditSource("src/components/example/Bypass.tsx", `// admin-ui-strict-disable\nexport default () => <div />`).some((v) => v.rule === "bypass"));
assert.ok(auditSource("src/components/example/Fake.tsx", `function Button(){ return <button className="bg-white">Fake</button> } export default Button;`).some((v) => v.rule === "recreated-primitive"));

console.log("Admin UI strict contract self-test: PASS");
