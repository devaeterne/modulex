# Project & Order Documents Design

## Goal

Add a shared, private document subsystem for operational Project and Order attachments while preserving accepted Proposal PDFs as immutable system-generated Project artifacts.

## Architecture

Use a new `entity_documents` metadata table backed by one private Supabase Storage bucket, `entity-documents`. Documents are polymorphically attached to `project` or `order`; the canonical registration/deactivation RPCs derive and validate entity ownership, enforce append-safe metadata lifecycle, and write Customer activity. Project reads include both Project-owned documents and documents attached to Orders linked to that Project without duplicating storage objects.

The existing accepted Proposal artifact flow remains unchanged and is presented as a separate `System Documents` section in the Project Documents tab.

## Supported files

The bucket accepts files up to 25 MiB with these MIME families: PDF, JPEG, PNG, WEBP, DOCX, XLSX and CSV. The registration RPC also validates file extension, normalized file name, entity-scoped storage path, non-negative/maximum size, document type and MIME value. Browser validation is an early UX guard only.

## Document types

`drawing`, `measurement`, `contract`, `customer_file`, `specification`, `photo`, `installation`, `change_order`, `other`.

## Lifecycle and security

- File bytes remain private.
- Staff access uses short-lived signed URLs.
- Upload/register/deactivate is limited to active `super_admin`, `admin`, and `sales` roles, matching the existing Customer document mutation boundary.
- Read access is available to active operational staff roles that already work with Projects/Orders (`super_admin`, `admin`, `sales`, `finance`, `warehouse`, `shipping`).
- Direct metadata insert/update/delete is not the lifecycle API.
- Metadata is append-safe; deactivation retains file bytes/history and hides the document from active lists.
- Registered Storage objects cannot be overwritten or deleted through browser-authenticated storage operations. Delete access exists only for unregistered orphan objects so failed metadata registration can be cleaned up.
- Storage paths are scoped as `project/<project-id>/...` or `order/<order-id>/...`.
- No service-role credential is exposed to browser code.

## UI

Create a reusable `EntityDocumentsPanel` using the existing Modulex Admin primitives. It supports multi-file selection, document type, shared description, upload progress state, loading/empty/error/retry states, preview/download via signed URL and soft deactivation.

Project Documents renders:
1. `Uploaded Documents` — Project attachments plus attachments from linked Orders, with a Source column identifying Project or Order.
2. `System Documents` — existing immutable accepted Proposal PDF snapshots.

Order Detail renders `Documents & Photos` as a dedicated panel without changing Order pricing/status lifecycle behavior.

## Data flow

1. User selects one or more files.
2. Frontend rejects unsupported type/extension or files over 25 MiB before upload.
3. Each file uploads to the private bucket at an entity-scoped UUID path.
4. `register_entity_document` validates metadata and entity ownership and writes `entity_documents` plus Customer activity.
5. If registration fails, the client removes the still-unregistered orphan object.
6. Lists come from `list_entity_documents`; Project mode optionally includes linked Order documents.
7. Preview/download requests a 60-second signed URL.
8. Deactivation calls `deactivate_entity_document`; file bytes stay retained for audit/history.

## Verification

Add regression assertions to the existing Admin Customer detail contract for Project/Order integration, private bucket, MIME/size controls, RPC/grant/lifecycle guards, linked-Order visibility and preservation of Proposal system documents. UI changes must remain compatible with `smoke:admin-ui-strict`, typecheck, lint and Admin build in PR CI.