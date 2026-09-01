# Modulex Admin UI Guide

This is the Modulex Admin UI source of truth. Feature code composes shared primitives; it does not invent a second visual system or copy TailAdmin examples.

## Layout

- Use the existing Admin shell and `PageBreadCrumb`/PageHeader conventions. Keep content inside the responsive shell and use its established content width.
- Route-level classes are for layout (`width`, `margin`, `padding`, positioning, flex/grid alignment), not component appearance.

## Shared ownership

- Theme/design tokens: `src/components/ui/theme/adminTheme.ts`.
- Buttons: `src/components/ui/button/Button.tsx`.
- Inputs, selects, textareas, checkboxes, switches: `src/components/form`.
- Badges, modals, tables, cards and common surfaces: `src/components/ui` and `src/components/common`.
- If a state is missing, extend a reviewed shared variant/API first; do not create a route-local primitive.

## Semantic variants and states

- Button intent is semantic: `primary`, `outline`, `danger`, or `ghost`. Routes do not recreate those states with local color classes.
- Badge/status colors are semantic (`primary`, `success`, `error`, `warning`, `info`, neutral light/dark) and come from the shared status-tone map. Do not map warning/error/success to unrelated feature-local colors.
- Field base appearance, default/disabled/error/success states, surfaces, and the keyboard focus ring are owned by the shared theme token module.
- Shared dark-mode contrast belongs to the primitive/token layer. Routes should not patch dark-mode readability with local appearance overrides.

## Patterns

- Use shared button variants/sizes and shared field controls with visible labels, validation, focus, keyboard and ARIA behavior.
- Use shared cards/sections, `Badge`/semantic status patterns, and shared modal/dialog behavior with explicit cancel/confirm actions.
- Dropdowns close on Escape; actionable dropdown items remain keyboard-focusable and define light/dark states.
- Switches use native keyboard-operable controls with `role="switch"` and `aria-checked`; checkboxes preserve native checkbox semantics and visible keyboard focus.
- Modals expose dialog semantics, keep keyboard focus inside while open, and restore focus to the opener when closed.
- Tables keep header/body/loading/empty columns aligned and contain intentional horizontal overflow in their viewport.
- Loading, empty and error states are explicit and readable; retryable operations expose retry behavior.

## Styling and responsive behavior

- Do not override shared appearance from routes with arbitrary `bg-*`, appearance `text-*`, `border-*`, `rounded-*`, `shadow-*`, or component padding/height classes.
- Preserve light/dark behavior through shared variants and use the established spacing scale.
- Keep mobile layouts usable at shell breakpoints; avoid fixed-width content escaping the viewport.

Feature/route code owns composition and domain state. The shared UI layer owns reusable visual primitives and semantic variants. UI-2B owns the table shell/viewport contract; UI-2C owns shared variants, theme tokens, dark mode, and foundational control accessibility. UI-2D applies those foundations during the full route regression pass.
