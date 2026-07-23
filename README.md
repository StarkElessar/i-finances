# SolidStart

Everything you need to build a Solid project, powered by [`solid-start`](https://start.solidjs.com);

## Creating a project

```bash
# create a new project in the current directory
npm init solid@latest

# create a new project in my-app
npm init solid@latest my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Generating UI components

Use the local Plop generator to scaffold component folders with a TSX file, an `index.ts` re-export and an SCSS module:

```bash
pnpm g:component
```

The command is interactive by default. You can also pass the component name and target directory directly:

```bash
pnpm g:component BrandPanel src/views/sign-in/ui
```

Optional flags:

```bash
pnpm g:component BrandPanel src/views/sign-in/ui --no-css
pnpm g:component BrandPanel src/views/sign-in/ui --no-type
```

## Generating views with routes

Use the view generator to create a route file, a view component and an SCSS module:

```bash
pnpm g:view CashFlow
```

This creates `src/routes/(app)/cash-flow.tsx`, `src/views/cash-flow/page.tsx` and `src/views/cash-flow/cash-flow.module.scss`.

Optional route flags:

```bash
pnpm g:view ResetPassword --group auth --route reset-password
pnpm g:view AccountSettings --route settings/account
```

## Building

Solid apps are built with _presets_, which optimise your project for deployment to different environments.

By default, `npm run build` will generate a Node app that you can run with `npm start`. To use a different preset, add it to the `devDependencies` in `package.json` and specify in your `app.config.js`.

## Managing exchange rates

Apply committed database migrations before writing rates:

```bash
pnpm db:migrate
```

Create or update one canonical daily rate:

```bash
pnpm db:rate -- \
  --from USD \
  --to BYN \
  --rate 3.25 \
  --date 2026-07-24 \
  --source manual
```

The direction is explicit: `amountTo = amountFrom * rate`. Repeating the
command for the same currency pair and date updates the existing record.

## This project was created with the [Solid CLI](https://github.com/solidjs-community/solid-cli)
