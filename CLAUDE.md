# i-finances — Claude agent instructions

## MCP server: i-finances

This project ships an MCP server (`apps/mcp`) that lets you manage the finance tracker directly from a Claude session.

### When to use the MCP tools

Trigger the MCP tools whenever the user:
- mentions buying something, spending money, or making a payment
- asks to record / add / log an expense or income
- says things like "купил", "потратил", "запиши", "добавь трату", or any equivalent in any language
- is at a shop and shares a purchase amount

### Available tools

| Tool | Purpose |
|---|---|
| `list_categories` | List expense categories (id, name, keywords). Always call this first to resolve the category before recording. |
| `list_contacts` | List contacts (id, name, phone, type). Use when the user mentions a payee / shop / person. |

### Recording an expense — step-by-step

1. Call `list_categories` to get the full list.
2. Match the user's description to the best category by name or keywords (fuzzy match — e.g. "ашан" → "Продукты").
3. If unsure about the category, ask. Never guess silently.
4. Once you have `categoryId` and `amountMinor` (amount × 100, integer), record the operation.
5. Use the item name(s) as `title`, not the category name — category is already stored in `categoryId`.
6. Confirm the entry back to the user: "Записал: 47.90 BYN — Продукты (Ашан)".

### Amount conversion

Always convert decimal amounts to minor units: `47.90 → 4790`. Parse the string carefully to avoid floating-point errors (multiply the integer and fractional parts separately).

### Default values

- `type`: `"expense"` (unless user says "доход" / "income")
- `happenedOn`: today's date in `YYYY-MM-DD` format (local time)
- `comment`: empty string unless the user provides one

### Important constraints

- Never record an operation without confirming the category with the user if you're not confident.
- Never invent a categoryId — always resolve it from `list_categories`.
- The MCP server is only available when running from the project directory with `.mcp.json` loaded.
