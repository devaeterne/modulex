import fs from "node:fs";

const path = "ADMIN_ROADMAP.md";
let text = fs.readFileSync(path, "utf8");

const replacements = [
  [
    "Main baseline: `08c8fdec5ee2ef0da88a575f9346061c903cc7b8`",
    "Main baseline: `f9d9571c70e911ee41c588e2ff8bd17a9a351a05`",
  ],
  [
    "Current Admin next action: **A1.2A — review global and customer-scoped order list consistency**",
    "Current Admin next action: **A1.2B — verify create/edit/detail flows use one domain contract**",
  ],
  [
`- [~] Review global and customer-scoped order list consistency. (A1.2A)
  - Both \`/customers/orders\` and \`/customers/[id]/orders\` remain on the shared \`CustomerOrdersList\` contract.
  - Search, status filtering, exact filtered count, and page windows move to Supabase through a \`security_invoker=true\` \`customer_order_directory\` view; customer name/code search no longer fans out matching customer IDs into the browser.
  - Route-scope summary cards use the \`SECURITY INVOKER\` \`get_customer_order_list_summary(uuid)\` RPC under existing customer/order RLS.
  - Original PR #125 was merged into the already-closed #124 branch rather than \`main\`; \`repair/a12a-order-list-main\` replays the review-hardened package onto current \`main\` while preserving newer GC-2 work.
  - Completion remains gated on repair PR merge, Admin production deploy, production SQL migration, live authenticated acceptance, and advisor review.`,
`- [x] Review global and customer-scoped order list consistency. (A1.2A)
  - Both \`/customers/orders\` and \`/customers/[id]/orders\` use the shared \`CustomerOrdersList\` contract with server-side search/status filtering, exact filtered count, page windows, URL state, and route-scope summary aggregation.
  - PR #130 repaired the earlier stacked-PR base error and merged A1.2A to \`main\` as \`f9d9571c70e911ee41c588e2ff8bd17a9a351a05\`; Vercel Admin production deployment \`dpl_699J47YQXfSx3fW9bvkEAAC9c8eo\` is \`READY\` from that exact SHA.
  - Production migration \`20260829193058_customer_order_list_summary\` installed \`customer_order_directory\` with \`security_invoker=true\` and authenticated-only SELECT plus \`get_customer_order_list_summary(uuid)\` as SECURITY INVOKER / STABLE with an empty \`search_path\` and authenticated-only EXECUTE.
  - Read-only authenticated Admin acceptance verified 5/5 direct-vs-directory RLS-visible rows, working order/customer-code/customer-name searches, 1/1 scoped rows, and exact global/scoped summary parity. A profiles-less authenticated caller saw 0 directory rows and a zero summary, confirming underlying RLS remains authoritative.
  - No production data writes were made during acceptance. Post-DDL Supabase advisors reported no A1.2A-specific security or performance finding; existing Store SECURITY DEFINER/auth warnings and broader FK/index/policy performance backlog remain outside this package.`
  ],
];

for (const [from, to] of replacements) {
  if (!text.includes(from)) {
    throw new Error(`Expected roadmap text not found: ${from.slice(0, 120)}`);
  }
  text = text.replace(from, to);
}

fs.writeFileSync(path, text);
console.log("A1.2A closeout roadmap patch applied.");
