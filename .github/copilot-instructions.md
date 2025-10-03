# Meteor DevTools Evolved - Copilot Agent Instructions

## Repository Overview

**Meteor DevTools Evolved** is a browser extension (Chrome/Firefox) for Meteor.js development tools. Tracks DDP messages, inspects Minimongo, monitors subscriptions/performance.

**Stack:** TypeScript, React 17, MobX, SASS/Tailwind/DaisyUI, Webpack 5, Jest, Blueprint UI, Node.js v14.19.3. Medium-sized repo (~8K lines, 1.2MB) with test Meteor app.

## Setup (ALWAYS DO FIRST)

1. `yarn install --frozen-lockfile` (70-90s)
2. `cd devapp && yarn install` (10s)

**Node:** v14.19.3 (Volta) or v18 (CI) both work. Network errors? Firewall may block registries - ask user to update settings.

## Build, Test & Lint

**Build (always from root, not subdirs):**
- Chrome: `yarn run build:chrome` (14-15s) → `extension/chrome/` with Manifest V3
- Firefox: `yarn run build:firefox` (14-15s) → `extension/firefox/` with Manifest V2  
- Clean: `yarn run clean` (removes build dirs)

**Test:**
- `yarn test` (23-24s, auto-runs build:chrome first) - 6 suites, 123 tests
- `yarn test:watch` (for iterative development)
- Tests in `src/**/__tests__/*.spec.ts`

**Lint:**
- `yarn run lint` - ESLint + Prettier + TypeScript checks
- Pre-commit hook auto-runs lint-staged (ESLint, Prettier, tsc-files, React tests)
- Existing Prettier errors in codebase - only fix files you modify

**Dev mode (requires Meteor, not in CI):**
- `yarn dev` or `yarn dev:chrome` / `yarn dev:firefox` - NOT recommended for agents

## Project Structure

**Key directories:**
- `src/` - Main TypeScript/React source (Browser/, Pages/, Stores/, Components/, Utils/, Database/)
- `extension/` - Manifests (V2/V3), icons, HTML pages
- `webpack/` - Build configs (base.js, chrome/firefox prod/dev)
- `devapp/` - Test Meteor app (v2.9.1), devapp-X.X.X/ legacy test apps
- `.github/workflows/lint.yml` - CI runs lint on push/PR (Node 18)

**Config files:** tsconfig.json (ES6, `@/*`→`src/*`), jest.config.js (ts-jest), .eslintrc.js (@tstt/eslint-config), .prettierrc.js, .babelrc, .editorconfig (2-space), .husky/pre-commit

**Entry points (webpack/base.js):** App.tsx (panel UI), Browser/{Background,Content,Inject,DevTools}.ts

## CI/CD

**GitHub Actions (`.github/workflows/lint.yml`):** Triggers on push to `development` or any PR. Runs: checkout → Node 18 setup → `yarn install --frozen-lockfile` → `yarn run lint`. **No tests or builds in CI** - always test locally first.

## Common Issues

1. **Build artifacts:** `.gitignore` excludes `extension/chrome` and `extension/firefox`
2. **Formatting:** Existing Prettier violations - only fix files you modify
3. **TypeScript:** Webpack compiles, not `tsc` - use build commands
4. **Manifests:** Chrome=V3, Firefox=V2. Edit source manifests in `extension/`, not build output
5. **Test deps:** `yarn test` auto-runs `yarn build:chrome` first
6. **Path aliases:** `@/*` → `src/*` (tsconfig.json, webpack/base.js)
7. **Dependencies:** MobX (not Redux), Blueprint UI, Dexie (IndexedDB)

## Workflow

1. `yarn install --frozen-lockfile` (if not done or package.json changed)
2. Edit files in `src/`
3. `yarn run build:chrome` and/or `yarn run build:firefox`
4. `yarn test` (includes build + tests)
5. `yarn run lint`
6. Commit (Husky auto-runs lint-staged)

**When to run:**
- `yarn install` - Start of work, after package.json changes
- `yarn test` - After code changes
- `yarn run lint` - Before committing
- `yarn run clean` - Fresh build, switching browsers

**Add tests:** Place in `__tests__/` dirs with `.spec.ts` extension. Follow patterns in `src/Utils/__tests__/` or `src/Pages/Panel/Minimongo/services/__tests__/`.

## Notes

- devapp needs Meteor 2.9.1 (optional for extension dev)
- Extension tracks DDP via `src/Browser/Inject.ts` page injection
- Performance tracking: `src/Pages/Panel/Performance/`
- Bookmarks: IndexedDB via Dexie (`src/Database/PanelDatabase.ts`)

**Trust these validated instructions.** Only search codebase for specific errors or implementation details not covered here.
