import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const [globalLightbox, projectGallery, navbar, leadForm] = await Promise.all([
  read("src/components/GalleryLightbox.tsx"),
  read("src/components/gallery/StoreProjectsGallery.tsx"),
  read("src/components/Navbar.tsx"),
  read("src/components/leads/LeadForm.tsx"),
]);

// Global legacy lightbox must not expose inactive controls to assistive tech/focus order.
assert.match(
  globalLightbox,
  /if\s*\(\s*!isOpen\s*\)\s*return\s+null/,
  "Closed global lightbox must be removed from the rendered accessibility/focus tree",
);
assert.match(globalLightbox, /role=["']dialog["']/, "Open global lightbox must expose dialog semantics");
assert.match(globalLightbox, /aria-modal=["']true["']/, "Open global lightbox must be modal");
assert.match(globalLightbox, /aria-label=["'][^"']+["']/, "Global lightbox dialog must have an accessible name");
assert.match(globalLightbox, /aria-label=["']Close[^"']*["']/, "Global lightbox close button must have an accessible name");
assert.match(globalLightbox, /bi bi-x-lg[^>]*aria-hidden=["']true["']/, "Decorative close icon must be hidden from assistive tech");
assert.match(globalLightbox, /iframe[\s\S]*title=["'][^"']+["']/, "Panorama iframe must have an accessible title");
assert.match(globalLightbox, /event\.key\s*===\s*["']Escape["']/, "Global lightbox must close with Escape");

// The CMS project dialog already has modal semantics; GC-8B also requires deterministic focus entry/return.
assert.match(projectGallery, /triggerRef|lastTriggerRef|openerRef/, "Project gallery must retain the opener for focus return");
assert.match(projectGallery, /closeButtonRef|dialogRef/, "Project gallery must hold a focus target inside the dialog");
assert.match(projectGallery, /\.focus\(\)/, "Project gallery must actively manage dialog focus");

// Only one logo representation should contribute the brand name to the accessibility tree.
assert.match(navbar, /className="logo-dark"\s+alt=""\s+aria-hidden="true"/, "Dark-mode duplicate logo must be decorative");

// Form baseline: all submission feedback remains announced and primary fields remain explicitly labelled.
assert.match(leadForm, /role="alert"/, "Lead form errors must remain announced");
assert.match(leadForm, /role="status"\s+aria-live="polite"/, "Lead form success state must remain announced");
assert.match(leadForm, /htmlFor=\{`\$\{type\}-email`\}/, "Lead form email input must retain an explicit label association");

console.log("GC-8B accessibility contract: PASS");
