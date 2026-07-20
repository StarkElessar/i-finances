# Agent Instructions

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
