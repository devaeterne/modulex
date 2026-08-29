import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const [gallery, lightTheme, darkTheme] = await Promise.all([
  read("src/components/gallery/StoreProjectsGallery.tsx"),
  read("src/css/style.css"),
  read("src/css/dark-mode.css"),
]);

for (const forbidden of ["bg-white", "btn-dark", "btn-outline-dark", "text-muted", "#f4f4f4", "rgba(0, 0, 0, 0.86)"]) {
  assert.ok(!gallery.includes(forbidden), `Gallery must not bypass the theme with ${forbidden}`);
}

for (const required of [
  "gallery-filter",
  "project-gallery-card",
  "project-gallery-meta",
  "gallery-lightbox active",
  "lightbox-overlay",
  "project-gallery-dialog",
  "lightbox-close",
  "project-gallery-media",
]) {
  assert.ok(gallery.includes(required), `Gallery should use theme-aware class ${required}`);
}

assert.match(lightTheme, /\.project-gallery-card\s*\{[\s\S]*background:\s*white/i, "Light theme should own the Gallery card surface");
assert.match(lightTheme, /\.project-gallery-dialog\s*\{[\s\S]*background:\s*var\(--cream\)/i, "Light theme should own the Gallery dialog surface");
assert.match(lightTheme, /\.project-gallery-meta[\s\S]*color:\s*var\(--text-light\)/i, "Light theme should own Gallery secondary text");

assert.match(darkTheme, /body\.dark\s+\.project-gallery-card\s*\{[\s\S]*background:\s*var\(--bg-card\)/i, "Dark theme should override Gallery cards");
assert.match(darkTheme, /body\.dark\s+\.project-gallery-dialog\s*\{[\s\S]*background:\s*var\(--bg-elevated\)/i, "Dark theme should override Gallery dialogs");
assert.match(darkTheme, /body\.dark\s+\.project-gallery-meta[\s\S]*color:\s*var\(--text-secondary\)/i, "Dark theme should override Gallery secondary text");

console.log("Gallery light/dark theme contract: PASS");
