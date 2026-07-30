# Kinema — Agent Instructions

## Setup

- Package manager: **pnpm** (never npm/yarn)
- Install: `pnpm install`

## Commands (root)

All routed through **Turbo**:

| Command | What |
|---------|------|
| `pnpm dev` | Start demo Astro dev server |
| `pnpm build` | Build all packages |
| `pnpm lint` | oxlint across workspace |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm test` | vitest run in `packages/kinema` |
| `pnpm check-types` | `tsc --noEmit` per package |
| `pnpm format` | oxfmt write |

## Packages

| Path | Name | Role |
|------|------|------|
| `packages/kinema` | `@repo/kinema` | Core animation engine (Clips, Fibers, Runtime) |
| `apps/demo` | `demo` | Astro 7 + SolidJS demo site |
| `packages/ui` | `@repo/ui` | Placeholder |
| `packages/typescript-config` | `@repo/typescript-config` | Shared tsconfig base |

Workspace: `apps/*`, `packages/*`. Use `workspace:*` for internal deps.

## Toolchain

- **Tests**: vitest 4 in `packages/kinema`. Run from root: `pnpm test`
- **TSConfig**: both packages extend `@repo/typescript-config/base.json`

## Code style

- Use braces `{}` with all control statements (`if`/`for`/`while`/`else`)
