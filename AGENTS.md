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
