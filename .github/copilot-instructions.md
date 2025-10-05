# Meteor DevTools Evolved - Copilot Agent Instructions

     ## Repository Overview

     **Meteor DevTools Evolved** is a browser extension (Chrome/Firefox) for
   Meteor.js development tools. Tracks DDP messages, inspects Minimongo, monitors
   subscriptions/performance.

     **Stack:** TypeScript, React 17, MobX, SASS/Tailwind/DaisyUI, Webpack 5, Jest,
    Blueprint UI, Node.js v14.19.3. Medium-sized repo (~8K lines, 1.2MB) with test
   Meteor app.

     ## Setup (ALWAYS DO FIRST)

     1. `yarn install --frozen-lockfile` (70-90s)
     2. `cd devapp && yarn install` (10s)

     **Node:** v14.19.3 (Volta) or v18+ (CI) both work. Network errors? Firewall may
    block registries - ask user to update settings.

     ## Build, Test & Lint

     **Build (always from root, not subdirs):**
     - Chrome: `yarn run build:chrome` (14-15s) → `extension/chrome/` with Manifest
    V3
     - Firefox: `yarn run build:firefox` (14-15s) → `extension/firefox/` with
   Manifest V2
     - Clean: `yarn run clean` (removes build dirs)

     **Test:**
     - `yarn test` (23-24s, auto-runs build:chrome first) - 6 suites, 123 tests
     - `yarn test:watch` (for iterative development)
     - Tests in `src/**/__tests__/*.spec.ts`

     **Lint:**
     - `yarn run lint` - ESLint + Prettier + TypeScript checks
     - Pre-commit hook auto-runs lint-staged (ESLint, Prettier, tsc-files, React
   tests)
     - Existing Prettier errors in codebase - only fix files you modify

     **Dev mode (requires Meteor, not in CI):**
     - `yarn dev` or `yarn dev:chrome` / `yarn dev:firefox` - NOT recommended for
   agents

     ## Project Structure

     **Key directories:**
     - `src/` - Main TypeScript/React source (Browser/, Pages/, Stores/,
   Components/, Utils/, Database/)
     - `extension/` - Manifests (V2/V3), icons, HTML pages
     - `webpack/` - Build configs (base.js, chrome/firefox prod/dev)
     - `devapp/` - Test Meteor app (v2.9.1), devapp-X.X.X/ legacy test apps
     - `.github/workflows/lint.yml` - CI runs lint on push/PR (Node 18)

     **Config files:** tsconfig.json (ES6, `@/*`→`src/*`), jest.config.js
   (ts-jest), .eslintrc.js (@tstt/eslint-config), .prettierrc.js, .babelrc,
   .editorconfig (2-space), .husky/pre-commit

     **Entry points (webpack/base.js):** App.tsx (panel UI),
   Browser/{Background,Content,Inject,DevTools}.ts

     ## CI/CD

     **GitHub Actions (`.github/workflows/lint.yml`):** Triggers on push to
   `development` or any PR. Runs: checkout → Node 18 setup → `yarn install
   --frozen-lockfile` → `yarn run lint`. **No tests or builds in CI** - always test
    locally first.

     ## Common Issues

     1. **Build artifacts:** `.gitignore` excludes `extension/chrome` and
   `extension/firefox`
     2. **Formatting:** Existing Prettier violations - only fix files you modify
     3. **TypeScript:** Webpack compiles, not `tsc` - use build commands
     4. **Manifests:** Chrome=V3, Firefox=V2. Edit source manifests in
   `extension/`, not build output
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

     **Add tests:** Place in `__tests__/` dirs with `.spec.ts` extension. Follow
   patterns in `src/Utils/__tests__/` or
   `src/Pages/Panel/Minimongo/services/__tests__/`.

     ---

     ## 🎯 Architecture Review Agent Mode

     **When reviewing designs or implementing new features**, operate as an
   architecture expert who:

     ### 1. Explore Before Accepting

     **ALWAYS examine existing code before accepting design docs:**

     ```typescript
     // Don't trust design docs - verify against real code
     ✅ Read: src/Injectors/DDPInjector.ts (proven injection pattern)
     ✅ Read: src/Stores/Panel/DDPStore.ts (proven store pattern)
     ✅ Search: "wrapMethod" OR "correlation" in codebase
     ✅ Compare: Design claims vs actual implementation

   Key Question: "Does this infrastructure already exist?"

     * 95% of the time: YES (check src/Browser/Inject.ts, MeteorAdapter.ts)

   2. Copy Proven Patterns (Don't Invent)

   This codebase has working patterns - REUSE THEM:

   Pattern Library:

     * Method Interception: Copy DDPInjector.ts (lines 11-25)
     * MobX Stores: Copy DDPStore.ts (observable/computed/action)
     * Method Wrapping: Copy MeteorAdapter.ts (lines 23-44) - ALREADY WRAPS
   MINIMONGO
     * Correlation: Copy DDPStore.getSubscriptionMeta() (lines 77-102)
     * React Components: Copy DDP/DDPLog.tsx (observer pattern)

   Template for new features:

     // ✅ GOOD: "Following the proven DDP pattern from DDPInjector.ts..."
     // ❌ BAD: "New innovative architecture for..."

     // Copy this:
     const original = Meteor.connection._stream.send
     Meteor.connection._stream.send = function(...args) {
       send.apply(this, args)  // ALWAYS call original
       sendMessage('event-type', { data, timestamp: Date.now() })
     }

   3. Think in Correlations

   Look for opportunities to combine data sources:

   Existing Correlations (PROVEN):

     * DDPStore + SubscriptionStore = subscription duration tracking
     * Already working at DDPStore.getSubscriptionMeta()

   New Opportunities:

     * DDPStore (server messages) + MinimongoStore (client queries) = truth
   validation
     * DDP "added" messages + Minimongo documents = origin tracing
     * DDP "changed" timestamps + Query timestamps = freshness detection

   Ask: "What if we correlated X with Y to validate Z?"

   4. Challenge Constructively

   When reviewing designs, ask:

     * ❓ "Does the Performance tab already wrap these methods?" (Yes -
   MeteorAdapter.ts)
     * ❓ "Does the DDP tab already track messages with stacks?" (Yes -
   DDPInjector.ts)
     * ❓ "Can we correlate these data sources?" (Usually yes)
     * ❓ "What's the unique value vs existing tools?" (Must have compelling
   answer)

   Defend your reasoning with evidence:

     "I found that MeteorAdapter.ts already wraps Minimongo methods (lines 23-44).
     Your design should coordinate with this, not duplicate it."

   5. Write Implementation-Ready Docs

   Create docs that LLMs can implement from:

   BAD (Abstract):

     Implement method interception to capture queries.

   GOOD (Concrete):

     1. Read: src/Injectors/DDPInjector.ts (lines 11-25) - this is your template
     2. Copy the pattern:
        - Store original method
        - Wrap with new function
        - Call original.apply(this, args)
        - Send message with EJSON.stringify()
     3. File: src/Injectors/MinimongoInjector.ts (add wrapMethod function)
     4. Test: Run query in devapp, check devtools receives message

   6. Parallel Tool Usage

   Be efficient - call tools in parallel when independent:

     // ✅ GOOD: Parallel calls
     github.getFileContents('DDPInjector.ts')
     github.getFileContents('DDPStore.ts')
     github.getFileContents('MeteorAdapter.ts')
     github.searchCode('correlation')

     // ❌ BAD: Sequential calls for independent data
     await github.getFileContents('DDPInjector.ts')
     await github.getFileContents('DDPStore.ts')  // Could be parallel!

   -------------------------------------------------------------------------------

   📚 Quick Reference: Existing Infrastructure

   Message Passing (src/Browser/Inject.ts):

     * ✅ sendMessage(type, data) - Send to devtools panel
     * ✅ Registry.register(type, handler) - Listen for messages
     * ✅ getStackTrace(limit) - Capture call stack

   Method Wrapping (src/Injectors/MeteorAdapter.ts):

     * ✅ ALREADY WRAPS Minimongo methods (find, insert, update, etc.)
     * ✅ Sends meteor-data-performance messages
     * ✅ Proven pattern - doesn't break Meteor

   Correlation (src/Stores/Panel/DDPStore.ts):

     * ✅ getSubscriptionMeta() - Cross-references DDP + Subscriptions
     * ✅ Pattern to copy for other correlations

   MobX (all stores):

     * ✅ @observable - Reactive state
     * ✅ @computed - Derived state (memoized)
     * ✅ @action - State mutations
     * ✅ makeObservable(this) - Required in constructor

   -------------------------------------------------------------------------------

   🚩 Red Flags to Avoid

   🚩 Creating new message passing system → Use src/Browser/Inject.ts 🚩 Not
   checking if feature exists → Always search first 🚩 Missing correlation
   opportunities → Ask "can we combine data sources?" 🚩 Ignoring existing method
   wrapping → Check MeteorAdapter.ts 🚩 Abstract documentation → Include file paths
   and line numbers 🚩 Sequential tool calls → Use parallel when possible

   -------------------------------------------------------------------------------

   📊 Feature Implementation Checklist

   Before implementing any feature:

     * [ ]  Read existing similar feature (e.g., DDP tab for query tracking)
     * [ ]  Search for existing infrastructure (Inject.ts, MeteorAdapter.ts)
     * [ ]  Identify correlation opportunities (2+ data sources?)
     * [ ]  Check for conflicts (Performance tab wraps same methods?)
     * [ ]  Copy proven patterns (don't reinvent)
     * [ ]  Run yarn test before and after
     * [ ]  Update docs to match actual implementation

   -------------------------------------------------------------------------------

   🎓 Learning Resources

   Understanding codebase architecture:

     * Read: src/Browser/Inject.ts - Core infrastructure
     * Read: src/Injectors/DDPInjector.ts - Injection pattern
     * Read: src/Stores/Panel/DDPStore.ts - Store pattern
     * Read: src/Pages/Panel/DDP/DDPLog.tsx - UI pattern

   Understanding Meteor internals:

     * Meteor Docs: Collections
     * Minimongo Source: meteor/packages/minimongo

   Understanding this stack:

     * MobX Docs: Observables, Actions, Computed
     * Blueprint Docs: Components

   -------------------------------------------------------------------------------

   Notes

     * devapp needs Meteor 2.9.1 (optional for extension dev)
     * Extension tracks DDP via src/Browser/Inject.ts page injection
     * Performance tracking: src/Pages/Panel/Performance/
     * Bookmarks: IndexedDB via Dexie (src/Database/PanelDatabase.ts)

   Trust these validated instructions. Only search codebase for specific errors or
   implementation details not covered here.

   -------------------------------------------------------------------------------

   TL;DR for Architecture Reviews:

     1. Explore: Read actual code before accepting designs
     2. Copy: Reuse proven patterns (especially from DDP features)
     3. Correlate: Cross-reference data sources for validation
     4. Document: Write implementation-ready guides with file paths
     5. Test: Verify no conflicts with existing features

   Mantra: "We're extending proven patterns with correlation, not inventing new
   architecture."
