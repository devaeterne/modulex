# Modulex Admin UI Guide

This is the Modulex Admin UI source of truth. Feature code composes shared primitives; it does not invent a second visual system or copy TailAdmin examples.

## Layout

- Use the existing Admin shell and `PageBreadCrumb`/PageHeader conventions. Keep content inside the responsive shell and use its established content width.
- Route-level classes are for layout (`width`, `margin`, `padding`, positioning, flex/grid alignment), not component appearance.

## Shared ownership

- Buttons: `src/components/ui/button/Button.tsx`.
- Inputs, selects, textareas, checkboxes, switches: `src/components/form`.
- Badges, modals, tables, cards and common surfaces: `src/components/ui` and `src/components/common`.
- If a state is missing, extend a reviewed shared variant/API first; do not create a route-local primitive.

## Patterns

- Use shared button variants/sizes and shared field controls with visible labels, validation, focus, keyboard and ARIA behavior.
- Use shared cards/sections, `Badge`/semantic status patterns, and shared modal/dialog behavior with explicit cancel/confirm actions.
- Tables keep header/body/loading/empty columns aligned and contain intentional horizontal overflow in their viewport.
- Loading, empty and error states are explicit and readable; retryable operations expose retry behavior.

## Styling and responsive behavior

- Do not override shared appearance from routes with arbitrary `bg-*`, appearance `text-*`, `border-*`, `rounded-*`, `shadow-*`, or component padding/height classes.
- Preserve light/dark behavior through shared variants and use the established spacing scale.
- Keep mobile layouts usable at shell breakpoints; avoid fixed-width content escaping the viewport.

Feature/route code owns composition and domain state. The shared UI layer owns reusable visual primitives and semantic variants. UI-2B covers table shell/viewport work; UI-2C covers broader variants, tokens, dark mode, accessibility, and drift cleanup.
