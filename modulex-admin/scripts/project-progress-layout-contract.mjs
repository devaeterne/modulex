import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  assert(fs.existsSync(fullPath), `Project Progress layout requires ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
}

const projectDetail = read("src/components/customers/ProjectDetailWorkspace.tsx");
const projectProgress = read("src/components/customers/ProjectProgressSummary.tsx");

const progressPosition = projectDetail.indexOf("<ProjectProgressSummary");
const settingsPosition = projectDetail.indexOf('<ComponentCard title="Project Settings"');

assert(progressPosition >= 0, "Project Detail must render Project Progress");
assert(settingsPosition >= 0, "Project Detail must render Project Settings for managers");
assert(
  progressPosition < settingsPosition,
  "Project Progress must be a full-width overview before Project Settings instead of a tall side rail"
);
assert(
  !projectDetail.includes('2xl:grid-cols-[minmax(0,1fr)_380px]'),
  "Project Progress must not share a height-stretched side-rail grid row with Project Settings"
);
assert(
  projectProgress.includes("md:grid-cols-2") && projectProgress.includes("xl:grid-cols-4"),
  "Project Progress operational summaries must use a compact responsive four-card grid"
);
assert(
  projectProgress.includes('aria-label="Project lifecycle"') && projectProgress.includes("flex flex-wrap"),
  "Project lifecycle must render as a compact horizontal/wrapping badge flow"
);
assert(
  !projectProgress.includes("Recent Activity") && !projectProgress.includes("recentActivity"),
  "Project Progress must not duplicate the dedicated Project Activity surface"
);
assert(
  projectProgress.includes("Orders") &&
    projectProgress.includes("Delivery") &&
    projectProgress.includes("Installation") &&
    projectProgress.includes("Commercial"),
  "Project Progress must retain the four truthful operational summary dimensions"
);

console.log("PASS: compact Project Progress layout contract");
