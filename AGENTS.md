# Agent Instructions

## Local API Usage

Before using or changing project components, utilities, hooks, services, config helpers, or other local APIs, inspect their public contract first.

Do not infer props, arguments, return values, supported options, class merging behavior, or side effects when the implementation or exports are available in the repository.

If the public API is unclear after inspection, ask a clarifying question before choosing an implementation.

## Function Style

Prefer function declarations for top-level functions, including exported helpers and components.

Use `const` arrow functions for functions declared inside another function or inside a component.

```ts
export function formatAmount(value: number) {
    return value.toString();
}

export function AmountLabel() {
    const handleClick = () => {
        // ...
    };

    return null;
}
```

## Responsive Styles

Write responsive SCSS mobile-first: base styles must target the smallest viewport, and larger viewport overrides must be added with `min-width` media queries.

Always use the local responsive mixins from `src/shared/styles/mixins.scss` instead of raw `@media` queries. In SCSS modules, import them as:

```scss
@use "~/shared/styles/mixins" as mx;
```

Prefer `@include mx.media-mn(...)` for adaptive layout changes. Use `media-mx` or `media-mn-mx` only when the design requirement is explicitly max-width or bounded-range specific.
