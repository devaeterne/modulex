import fs from "node:fs";

const path = "modulex-admin/ADMIN_ROADMAP.md";
let text = fs.readFileSync(path, "utf8");

function replaceOnce(label, from, to) {
  const matches = text.split(from).length - 1;
  if (matches !== 1) {
    throw new Error(`${label}: expected exactly 1 match, found ${matches}`);
  }
  text = text.replace(from, to);
}

replaceOnce(
  "main baseline",
  "Main baseline: `c0adbfbb431973a3acb4a94902341ac64b11c1de`",
  "Main baseline: `8cce1b0c065e66c3939a96704b05aa6c96f2b3d8`"
);

replaceOnce(
  "cross-roadmap Admin next action",
  "Current cross-roadmap package: **Granite Center → Oakwell GC-3 company identity, Contact, About & Showroom is production-accepted and complete. GC-4 — Contact / Project Consultation is the next Granite package; Admin primary work remains Phase A1 and the current Admin next action remains A1.2B**",
  "Current cross-roadmap package: **Granite Center → Oakwell GC-3 company identity, Contact, About & Showroom is production-accepted and complete. GC-4 — Contact / Project Consultation is the next Granite package; Admin primary work remains Phase A1 and the current Admin next action remains A1.2C**"
);

replaceOnce(
  "current Admin next action",
  "Current Admin next action: **A1.2B — verify create/edit/detail flows use one domain contract**",
  "Current Admin next action: **A1.2C — define immutable vs editable fields by order lifecycle state**"
);

replaceOnce(
  "A1.2B task block",
  "- [ ] Verify create/edit/detail flows use one domain contract.\n- [ ] Define immutable vs editable fields by order lifecycle state.",
  `- [x] Verify create/edit/detail flows use one domain contract. (A1.2B)\n  - PR #135 merged the shared Admin order-domain adapter to \`main\` as \`e04425c0bd6c7ae0bf7df4fc447c90ed2e8809af\`; \`NewCustomerOrder\`, \`EditCustomerOrder\`, and \`CustomerOrderDetail\` now consume \`src/lib/customers/order-domain.ts\` for scoped context reads, price reads, mutation payload normalization, and Supabase error propagation while preserving the existing database mutation boundaries.\n  - TDD evidence: RED Actions run \`33272031540\` failed on the missing shared adapter; targeted GREEN run \`33272225887\` passed the new order-domain contract; final deterministic verification run \`33272334038\` passed order-domain/order-list/customer-detail/production-surface smoke checks, lint with 0 errors, production build, and diff-check after fixing the TypeScript narrowing regression exposed by the first full run.\n  - Admin Vercel production deployment \`dpl_EZnRkBzEpnU4quNdKPS2XAWaQy86\` and Store deployment \`dpl_Gq24GKZyrTZiL2xu1cE7KLzALVth\` are both \`READY\` from exact merge SHA \`e04425c0bd6c7ae0bf7df4fc447c90ed2e8809af\`.\n  - Read-only authenticated Admin acceptance verified the adapter's production query surface under existing RLS: the scoped customer/order resolved 1/1, the sample order exposed 3 items plus status history, and shared create/edit lookups returned 6 order price groups, 3 active payment methods, 462 products, 3 tax rules, and 462 current price rows. A profiles-less authenticated caller saw 0 profile/customer/order/item/approval rows.\n  - Catalog verification confirmed \`create_customer_order\`, \`update_customer_order\`, and \`set_customer_order_status\` remain SECURITY INVOKER (\`prosecdef=false\`), use \`search_path=pg_catalog, private\`, allow authenticated EXECUTE, and deny anon/PUBLIC EXECUTE. No production mutation RPC was invoked during acceptance, no production data was written, and A1.2B required no Supabase DDL or migration.\n- [ ] Define immutable vs editable fields by order lifecycle state. (A1.2C)`
);

fs.writeFileSync(path, text);
console.log("A1.2B roadmap closeout patch applied.");
