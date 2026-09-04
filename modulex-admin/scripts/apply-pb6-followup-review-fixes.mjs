import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const file = (relative) => path.join(root, relative);
const read = (relative) => fs.readFileSync(file(relative), "utf8");
const write = (relative, value) => fs.writeFileSync(file(relative), value);

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
}

{
  const relative = "modulex-admin/src/lib/customers/project-participants-commission-domain.ts";
  let source = read(relative);
  source = replaceOnce(
    source,
    '  if (!hasAnyRole(profile, ["super_admin", "admin", "finance", "sales"])) {\n    throw new Error("You do not have permission to view Project commissions.");\n  }',
    '  if (!hasAnyRole(profile, PB6_INTERNAL_ROLES)) {\n    throw new Error("You do not have permission to view Project commissions.");\n  }',
    "commission view client guard",
  );
  write(relative, source);
}

{
  const relative = "modulex-admin/src/lib/customers/project-commission-events.ts";
  let source = read(relative);
  source = replaceOnce(
    source,
    '["super_admin", "admin", "finance", "sales"].includes(role)',
    '["super_admin", "admin", "finance"].includes(role)',
    "commission event client guard",
  );
  write(relative, source);
}

{
  const relative = "modulex-admin/src/components/customers/project-detail/ProjectParticipantsCommissionPanel.tsx";
  let source = read(relative);
  source = replaceOnce(
    source,
    '<TableStateRow colSpan={7}>"No commission obligations have been created."</TableStateRow>',
    '<TableStateRow colSpan={7}>No commission obligations have been created.</TableStateRow>',
    "commission empty state",
  );
  write(relative, source);
}

{
  const relative = "modulex-admin/scripts/project-pb6-tab-access-percentage-basis-contract.mjs";
  let source = read(relative);
  source = replaceOnce(
    source,
    'const panelPath = "src/components/customers/project-detail/ProjectParticipantsCommissionPanel.tsx";\n',
    'const panelPath = "src/components/customers/project-detail/ProjectParticipantsCommissionPanel.tsx";\nconst eventDomainPath = "src/lib/customers/project-commission-events.ts";\n',
    "contract event domain path",
  );
  source = replaceOnce(
    source,
    '  [panelPath, "PB-6 panel must exist"],\n',
    '  [panelPath, "PB-6 panel must exist"],\n  [eventDomainPath, "PB-6 event domain must exist"],\n',
    "contract event domain existence",
  );
  source = replaceOnce(
    source,
    'const panel = read(panelPath);\n',
    'const panel = read(panelPath);\nconst eventDomain = read(eventDomainPath);\n',
    "contract event domain read",
  );
  source = replaceOnce(
    source,
    'assert.doesNotMatch(domain, /PB6_INTERNAL_ROLES[^\\n]*sales/, "Sales must not be part of PB-6 internal detail access");\n',
    'assert.doesNotMatch(domain, /PB6_INTERNAL_ROLES[^\\n]*sales/, "Sales must not be part of PB-6 internal detail access");\nassert.doesNotMatch(domain, /super_admin", "admin", "finance", "sales/, "Legacy Sales detail access must be removed from the PB-6 client domain");\nassert.doesNotMatch(eventDomain, /super_admin", "admin", "finance", "sales/, "Sales must not pass the commission-event client guard");\n',
    "contract sales client guards",
  );
  write(relative, source);
}

console.log("PB-6 follow-up review fixes applied");
