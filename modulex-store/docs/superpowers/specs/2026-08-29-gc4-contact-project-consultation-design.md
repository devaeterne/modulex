# GC-4 — Contact / Project Consultation Design

Date: 2026-08-29
Status: Approved design; implementation not started
Branch baseline: `main@a88d53a255099aef7b190b9a3f3ebcac2e5c80f8`
Roadmap package: GC-4 — Contact / Project Consultation

## 1. Purpose

GC-4 upgrades Oakwell's existing first-party Contact lead flow into a configurable Project Consultation flow without replacing the current lead/security architecture.

The package must preserve the existing native `/api/leads` path, `store_leads` operational workflow, attribution capture, privacy/marketing-consent separation, spam controls, and Dealer Application isolation. Mutable business choices must be Admin/Supabase-managed rather than Store source constants.

## 2. Source and truth constraints

GC-1 supports the following consultation concepts as migration candidates:

- project type/context;
- showroom/design consultation intent;
- project address/city/ZIP where operationally useful;
- desired consultation date as a preference, not a guaranteed appointment;
- project notes;
- existing name/email/phone/privacy/marketing/UTM fields already supported by Oakwell.

GC-1 does **not** approve concrete option values for `project_type` or `consultation_intent`. Therefore GC-4 must not invent or seed labels such as kitchen, bathroom, remodel, showroom, design, estimate, or similar business semantics unless they are explicitly approved through the controlled business workstream.

Customer drawing/file upload remains excluded from GC-4. Dealer supporting documents remain a separate private flow and are unchanged.

## 3. Current production baseline to preserve

The existing Store flow already provides:

- `/contact` with first-party `LeadForm`;
- `/api/leads` same-origin enforcement;
- 32 KB request-body limit;
- server-side normalization and validation;
- honeypot field propagation and DB enforcement;
- email and privacy acknowledgement validation;
- session/query UTM capture, landing-page capture, and referrer capture;
- separate optional marketing consent;
- a public `submit_store_lead(jsonb)` RPC boundary;
- spam/rate guard behavior for public submissions;
- Admin `/store/leads` list/detail workflow;
- separate Dealer Application handling and private supporting-document upload.

Production hardening is stricter than the historical migration file alone: the public `submit_store_lead(jsonb)` function is currently an invoker SQL wrapper and the privileged insert implementation lives under `store_api_private`. The public wrapper is executable by `anon`/service role and not by ordinary authenticated callers. GC-4 must preserve that boundary rather than reopening direct table/RPC write access.

## 4. Architectural decision

### 4.1 One Contact lead domain

GC-4 will **not** introduce a second consultation lead table, a second public submission endpoint, or a new public upload path.

Both General Inquiry and Project Consultation continue to submit as `lead_type = 'contact'` through `/api/leads` and the existing RPC contract. A new discriminator, `request_kind`, differentiates the two contact intents:

- `general_inquiry`
- `project_consultation`

For backward compatibility, a Contact payload that omits `request_kind` is treated as `general_inquiry` by the server/database boundary.

Dealer Application remains `lead_type = 'dealer_application'` and does not accept GC-4 project-consultation fields.

### 4.2 Conditional Project Consultation fields

When `request_kind = 'project_consultation'`, the lead may capture:

- `project_type`
- `consultation_intent`
- `project_address`
- `project_city`
- `project_postal_code`
- `preferred_consultation_date`

The existing `message` field remains the notes/free-text field for both Contact modes. GC-4 does not add a duplicate `project_notes` column.

Project address and preferred date are optional. Preferred date is explicitly a preference and never an appointment/SLA promise.

## 5. Data model

### 5.1 `store_leads` extension

Add nullable/compatible fields:

- `request_kind text`
- `project_type text`
- `consultation_intent text`
- `project_address text`
- `project_city text`
- `project_postal_code text`
- `preferred_consultation_date date`

`request_kind` is normalized so existing Contact records remain valid. The implementation may use a default/check constraint or migration backfill, but the final contract must make `general_inquiry` the deterministic Contact fallback and must reject consultation-only fields on Dealer Application submissions.

No new customer-upload token or document column is introduced for Contact/Project Consultation.

### 5.2 Business-configurable option domain

Introduce a small Admin-managed domain, planned as `store_lead_form_options`, with fields equivalent to:

- stable row ID;
- option group (`project_type` or `consultation_intent`);
- stable option key;
- display label;
- active flag;
- sort order;
- created/updated audit metadata as appropriate to existing Admin patterns.

The exact SQL naming/details may be refined during implementation to match current schema conventions, but the behavioral contract is fixed:

- only the two approved option groups are allowed;
- keys are stable identifiers, labels are mutable business copy;
- active/inactive is business-managed;
- ordering is business-managed;
- no business option rows are seeded by GC-4 without explicit approval;
- ordinary option management must not require manual SQL.

## 6. Public option projection

The Store must not directly query an Admin table with broad anonymous table grants.

Expose a narrow public projection/RPC that returns only active options and only these fields:

- group;
- key;
- label;
- sort order.

The public projection must fail closed: if no approved active options exist for a group, the Store receives an empty list. Draft/inactive rows and audit metadata never cross the public boundary.

Follow the same security posture used by recent Store CMS domains: Admin writes stay role/RLS controlled, while the Store consumes a narrow public projection.

## 7. Store UX

### 7.1 Contact form entry

`/contact` remains the canonical public page and uses the existing first-party form.

The Contact version of `LeadForm` begins with a required intent selector such as “How can we help?” whose controlled behavioral values are:

- General Inquiry
- Project Consultation

These two values are product behavior, not mutable business option content; they map to the fixed `request_kind` enum-like contract above.

### 7.2 General Inquiry

General Inquiry preserves the current Contact form behavior and required fields:

- first name;
- last name;
- email;
- message;
- privacy acknowledgement.

Phone remains optional. Marketing consent remains separately optional.

No project-consultation fields are submitted with General Inquiry.

### 7.3 Project Consultation

Selecting Project Consultation reveals the GC-4 project fields.

`project_type` and `consultation_intent` controls are rendered only when the public option projection returns one or more active options for that group. GC-4 does not render invented fallback business choices.

Project address/city/postal code and preferred consultation date may render as optional inputs because their field semantics are explicitly approved by the GC-1 manifest. The form copy must make the date a preference, not a confirmed booking.

The existing message textarea becomes the consultation/project-notes prompt when Project Consultation is selected, while still mapping to `message` in storage.

### 7.4 Accessibility and failure behavior

Conditional fields must remain keyboard accessible and correctly labelled. Hidden controls must not submit stale values after the user switches back to General Inquiry.

If option projection loading fails, the form remains usable with the approved fixed fields and without business-select controls. Failure to load options must not block General Inquiry submission.

## 8. API validation and normalization

`/api/leads` remains the only public Store lead endpoint.

GC-4 extends its code-owned validation with bounded normalization for the new scalar fields. At minimum:

- allow only `general_inquiry | project_consultation` for Contact;
- reject/strip GC-4 project fields for Dealer Application according to the implementation's fail-closed validation contract;
- impose explicit maximum lengths on project address/city/postal/option keys;
- parse preferred date strictly as a date-only value;
- reject malformed dates;
- do not convert preferred date into an appointment or timezone-bearing timestamp;
- preserve existing body-size, origin, email, privacy, document-count and attribution logic.

The Store client may perform normal HTML/UI validation, but server and DB boundaries remain authoritative.

## 9. DB boundary validation

The privileged submission implementation must independently validate the new contract before inserting.

For `project_type` and `consultation_intent`, non-empty submitted keys are accepted only when a corresponding **active** Admin-managed option exists in the correct group. Disabled, unknown, cross-group or forged option keys fail closed.

The public caller must not gain direct write access to the option table or `store_leads` table as part of this validation.

The existing public-wrapper/private-implementation RPC architecture must be retained or equivalently hardened. Any new privileged helper must follow the same explicit grant/revoke discipline and advisor review.

## 10. Admin UX

### 10.1 Lead visibility

Existing `/store/leads` remains the operational lead queue.

For a Project Consultation lead, the detail page adds a dedicated “Project Consultation” section showing:

- request kind;
- project type label/key as appropriate;
- consultation intent label/key as appropriate;
- project address;
- project city;
- project postal code;
- preferred consultation date.

General Inquiry and Dealer Application detail behavior remains compatible.

The lead list may expose/search/filter `request_kind` if useful during implementation, but the minimum acceptance requirement is that Project Consultation records are identifiable and their fields are visible in Admin detail.

### 10.2 Form-option management

Add an Admin surface under the Store lead area, planned as `/store/leads/form-options`.

It manages:

- group;
- key;
- label;
- active state;
- sort order.

Configuration changes require Store-management-level authorization. Sales users may continue to review/manage leads according to the existing lead workflow but must not receive permission to edit public form configuration solely because they can read leads.

The Admin surface must enforce the same allowed groups and key/label constraints as the data layer and must not expose elevated credentials to the browser.

## 11. Backward compatibility

GC-4 must preserve:

- existing Contact submissions that do not send `request_kind`;
- existing historical Contact rows;
- Dealer Application submission and document behavior;
- existing Admin lead workflow/status/assignment/internal notes;
- existing attribution fields and analytics events unless explicitly extended;
- privacy acknowledgement and optional marketing consent separation.

No migration may reinterpret historical Dealer Application fields as Project Consultation data.

## 12. Security properties

GC-4 acceptance requires all of the following to remain true:

- same-origin request check remains active;
- request-size limit remains active;
- honeypot remains active end-to-end;
- public rate/spam guard remains active;
- privacy acknowledgement remains mandatory;
- marketing consent remains optional and separately stored;
- attribution fields remain bounded and preserved;
- public callers cannot write `store_leads` directly;
- ordinary authenticated users cannot invoke the public lead submission path merely because they are authenticated;
- business option tables are not broadly anonymous-readable/writable;
- public option projection contains no private/admin metadata;
- forged/inactive option keys fail closed at the DB submission boundary;
- customer file upload is not introduced;
- Dealer supporting-document privacy/isolation is unchanged.

## 13. Testing strategy

Implementation follows TDD RED → GREEN.

### 13.1 Store/API contract tests

Add deterministic tests covering:

- General Inquiry backward compatibility;
- Project Consultation payload construction;
- conditional UI behavior;
- stale project values cleared/not submitted when switching to General Inquiry;
- public option projection empty-state behavior;
- unknown/inactive option rejection contract;
- malformed preferred date rejection;
- Dealer Application rejection/isolation from GC-4 fields;
- same-origin/body-size/privacy/honeypot/attribution regression coverage.

### 13.2 Admin contract tests

Cover:

- `/store/leads/form-options` authorization/navigation contract;
- allowed option groups only;
- active/sort-order management;
- Project Consultation detail rendering;
- no loss of Dealer Application detail behavior;
- Sales can review leads but cannot mutate form configuration.

### 13.3 SQL/security contract tests

Cover:

- new columns/check constraints;
- option-domain RLS/grants;
- narrow active public projection;
- no unauthorized direct table writes;
- active option-key validation inside the submission boundary;
- legacy Contact fallback to `general_inquiry`;
- Dealer Application isolation;
- existing public submission spam guard remains effective;
- explicit function grants/revokes after any function replacement.

Run Supabase security/performance advisors after schema/function changes and fix any GC-4-introduced warning before acceptance.

## 14. Implementation sequencing

The implementation plan should preserve this order:

1. add RED Store/Admin/SQL contracts for the approved design;
2. add schema/option-domain/public-projection changes with hardened permissions;
3. extend the private lead submission implementation and public wrapper contract;
4. extend Store lead types/API normalization;
5. add server-side public option query;
6. update Contact UI with conditional Project Consultation fields;
7. add Admin form-option management;
8. add Project Consultation visibility in Admin lead detail/list where needed;
9. run deterministic tests, lint/build/diff checks;
10. verify production migration, RLS/grants/advisors, public projection and live submission behavior;
11. record GC-4 production acceptance and update roadmaps only after production verification.

## 15. Production acceptance

GC-4 is complete only when production evidence shows:

- no Wufoo/Contact Form 7 dependency;
- configurable option management works from Admin without Store source edits;
- no unapproved option values were seeded by the migration;
- public option projection returns only active approved rows and safely returns empty arrays before configuration;
- a real General Inquiry can be submitted through the existing native path;
- a real Project Consultation can be submitted through the same native path using approved option keys when configured;
- privacy, optional marketing consent, UTM/landing/referrer attribution and spam controls are preserved;
- Project Consultation fields appear correctly in Admin;
- Dealer Application and private dealer supporting documents are unaffected;
- customer file upload remains absent;
- no new GC-4 security/advisor warning remains open.

## 16. Explicit non-goals

GC-4 does not:

- create a booking/calendar/appointment system;
- promise consultation availability, response time, design turnaround, installation, service area or pricing;
- migrate Wufoo or Contact Form 7;
- add customer drawing/file upload;
- reuse Dealer supporting-document storage for consumers;
- seed guessed project-type or consultation-intent business options;
- migrate Projects/Gallery media or taxonomy owned by GC-5;
- expand cabinet customer-journey content owned by GC-6.

## 17. Design conclusion

GC-4 extends the existing hardened lead domain instead of creating a parallel form subsystem. Fixed behavioral intent is code-owned; mutable business option labels/availability are Admin-managed data; public Store access is projection-only; submitted option keys are revalidated at the privileged DB boundary; and all existing privacy, attribution, spam and Dealer Application isolation guarantees remain in force.
