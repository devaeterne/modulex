import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const [globalLightbox, projectGallery, navbar, leadForm, contentQueries] = await Promise.all([
  read("src/components/GalleryLightbox.tsx"),
  read("src/components/gallery/StoreProjectsGallery.tsx"),
  read("src/components/Navbar.tsx"),
  read("src/components/leads/LeadForm.tsx"),
  read("src/lib/store/content/queries.ts"),
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

// CMS project dialog must support deterministic focus entry, trapping, Escape and focus return.
assert.match(projectGallery, /triggerRef|lastTriggerRef|openerRef/, "Project gallery must retain the opener for focus return");
assert.match(projectGallery, /closeButtonRef|dialogRef/, "Project gallery must hold a focus target inside the dialog");
assert.match(projectGallery, /\.focus\(\)/, "Project gallery must actively manage dialog focus");
assert.match(projectGallery, /event\.key\s*!==\s*["']Tab["']/, "Project gallery must explicitly handle Tab focus trapping");
assert.match(projectGallery, /querySelectorAll<HTMLElement>/, "Project gallery must derive focusable controls inside the dialog");

// Mobile navigation must expose state/current-page semantics and provide a keyboard Escape path back to its trigger.
assert.match(navbar, /burgerButtonRef/, "Mobile navigation must retain a ref to its trigger");
assert.match(navbar, /event\.key\s*!==\s*["']Escape["']/, "Mobile navigation must explicitly handle Escape");
assert.match(navbar, /setIsMobileOpen\(false\)/, "Escape handling must close the mobile navigation");
assert.match(navbar, /burgerButtonRef\.current\?\.focus\(\)/, "Closing the mobile navigation with Escape must restore trigger focus");
assert.match(
  navbar,
  /aria-current=\{pathname\s*===\s*item\.href\s*\?\s*["']page["']\s*:\s*undefined\}/,
  "Current primary navigation destination must expose aria-current=page",
);
assert.match(navbar, /className="logo-dark"\s+alt=""\s+aria-hidden="true"/, "Dark-mode duplicate logo must be decorative");

// Public CMS media must fail closed when required alt text is absent.
assert.match(contentQueries, /cover_image_alt\?\.trim\(\)/, "Project cover alt text must be normalized before publishing");
assert.match(contentQueries, /if\s*\(\s*!bucket\s*\|\|\s*!objectPath\s*\|\|\s*!coverImageAlt\s*\)\s*return\s+null/, "Projects without cover alt text must fail closed");
assert.match(contentQueries, /row\.alt_text\?\.trim\(\)/, "Project media alt text must be normalized before publishing");
assert.match(contentQueries, /if\s*\(\s*!altText\s*\)\s*return\s+null/, "Project media without alt text must fail closed");

// Form baseline: all submission feedback remains announced and primary fields remain explicitly labelled.
assert.match(leadForm, /role="alert"/, "Lead form errors must remain announced");
assert.match(leadForm, /role="status"\s+aria-live="polite"/, "Lead form success state must remain announced");
assert.match(leadForm, /htmlFor=\{`\$\{type\}-email`\}/, "Lead form email input must retain an explicit label association");

console.log("GC-8B accessibility contract: PASS");
