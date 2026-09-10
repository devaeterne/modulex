import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const iconPath = path.join(root, "src/app/icon.svg");
const legacyFaviconPath = path.join(root, "src/app/favicon.ico");

if (!fs.existsSync(iconPath)) {
  throw new Error("Expected Next.js app icon at src/app/icon.svg");
}

if (fs.existsSync(legacyFaviconPath)) {
  throw new Error("Legacy src/app/favicon.ico must be removed so it cannot override the current Modulex icon");
}

const icon = fs.readFileSync(iconPath, "utf8");
for (const token of ["#465FFF", "#667085", "Modulex"]) {
  if (!icon.includes(token)) {
    throw new Error(`App icon is missing expected Modulex brand token: ${token}`);
  }
}

console.log("Brand favicon contract passed.");
