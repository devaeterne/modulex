import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const [gallery, baseTheme, darkTheme, galleryTheme] = await Promise.all([
  read("src/components/gallery/StoreProjectsGallery.tsx"),
  read("src/css/style.css"),
  read("src/css/dark-mode.css"),
  read("src/css/gallery-projects.css"),
]);

for (const forbidden of ["bg-white", "btn-dark", "btn-outline-dark", "text-muted", "#f4f4f4", "rgba(0, 0, 0, 0.86)"]) {
  assert.ok(!gallery.includes(forbidden), `Gallery must not bypass the theme with ${forbidden}`);
}

for (const required of [
  "gallery-filter",
  "nav-link",
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

assert.match(baseTheme, /\.gallery-filter\s*\{/, "Gallery should reuse the Store theme filter system");
assert.match(baseTheme, /\.gallery-lightbox\s*\{/, "Gallery should reuse the Store theme lightbox system");
assert.match(darkTheme, /body\.dark\s+\.gallery-filter\s+\.nav-link/, "Existing dark theme should continue owning filter states");
assert.match(darkTheme, /body\.dark\s+\.lightbox-overlay/, "Existing dark theme should continue owning the lightbox overlay");

assert.match(galleryTheme, /\.project-gallery-card\s*\{[\s\S]*background:\s*white/i, "Light theme extension should own the Gallery card surface");
assert.match(galleryTheme, /\.project-gallery-dialog\s*\{[\s\S]*background:\s*var\(--cream\)/i, "Light theme extension should own the Gallery dialog surface");
assert.match(galleryTheme, /\.project-gallery-meta[\s\S]*color:\s*var\(--text-light\)/i, "Light theme extension should use the Store secondary-text token");
assert.match(galleryTheme, /body\.dark\s+\.project-gallery-card\s*\{[\s\S]*background:\s*var\(--bg-card\)/i, "Dark theme extension should override Gallery cards");
assert.match(galleryTheme, /body\.dark\s+\.project-gallery-dialog\s*\{[\s\S]*background:\s*var\(--bg-elevated\)/i, "Dark theme extension should override Gallery dialogs");
assert.match(galleryTheme, /body\.dark\s+\.project-gallery-meta[\s\S]*color:\s*var\(--text-secondary\)/i, "Dark theme extension should use the Store dark secondary-text token");

console.log("Gallery light/dark theme contract: PASS");
