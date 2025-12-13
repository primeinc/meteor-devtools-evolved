# Anti-Pattern Test Fixtures

This directory contains **intentional anti-patterns** used to test our code quality enforcement.

## ⚠️ WARNING

**DO NOT USE THESE PATTERNS IN PRODUCTION CODE**

These files demonstrate MobX + React anti-patterns that cause infinite render loops. They exist solely to verify our static analysis tests can detect violations.

## How to Test

The test suite automatically validates the detector in two ways:

```bash
yarn test:quality
```

This runs 4 tests:

1. **Scans `src/`** - expects **zero** violations (production code must be clean)
2. **Scans for observable arrays** - expects **zero** violations
3. **Checks ESLint config** - verifies rule exists
4. **Scans `tests/fixtures/`** - expects **≥5** violations (proves detector works)

If test #1 or #2 fails, you have real anti-patterns in your code.
If test #4 fails, the detector is broken.

## Anti-Patterns Covered

### AntiPattern1_WholeStoreInDeps.tsx
**Issue:** Entire store object in useCallback deps
```ts
useCallback(() => {...}, [settingStore])  // ❌ Bad
```
**Fix:** Use specific action method
```ts
useCallback(() => {...}, [settingStore.setFilter])  // ✅ Good
```
**Source:** BookmarksStatus.tsx (fixed in commit d285789)

---

### AntiPattern2_StoreWithObservable.tsx
**Issue:** Store object in deps while accessing observables inside
```ts
useCallback(() => {
  minimongoStore.setQueryLogFilter(method, !minimongoStore.queryLogFilters[method])
}, [minimongoStore])  // ❌ Bad - reads observable inside
```
**Fix:** Use specific action method only
```ts
useCallback(() => {
  minimongoStore.setQueryLogFilter(method, !minimongoStore.queryLogFilters[method])
}, [minimongoStore.setQueryLogFilter])  // ✅ Good
```
**Source:** QueryLog.tsx (fixed in commit d285789)

---

### AntiPattern3_StoreInUseMemo.tsx
**Issue:** Store object in useMemo deps
```ts
useMemo(() => {...}, [minimongoStore, selectedFormat])  // ❌ Bad
```
**Fix:** Use specific properties or methods
```ts
useMemo(() => {...}, [minimongoStore.activeCollection, selectedFormat])  // ✅ Good
```
**Source:** ExportDialog.tsx (fixed in current session)

---

### AntiPattern4_StoreInUseEffect.tsx
**Issue:** Store object in useEffect deps
```ts
useEffect(() => {
  panelStore.initialize()
}, [panelStore])  // ❌ Bad - triggers on every observable change
```
**Fix:** Use specific action method
```ts
useEffect(() => {
  panelStore.initialize()
}, [panelStore.initialize])  // ✅ Good
```
**Source:** Common pattern prevented

---

### AntiPattern5_MultipleStores.tsx
**Issue:** Multiple store objects in dependency arrays
```ts
useCallback(() => {...}, [settingStore])  // ❌ Bad
useEffect(() => {...}, [ddpStore])        // ❌ Bad
```
**Fix:** Use specific action methods for each
```ts
useCallback(() => {...}, [settingStore.setFilter])  // ✅ Good
useEffect(() => {...}, [ddpStore.loadData])         // ✅ Good
```
**Source:** Multiple components (DDPStatus.tsx, etc.)

---

## Why These Cause Infinite Loops

In MobX `observer()` components:

1. **Store objects are stable** - same reference even when observables change
2. **React can't detect changes** - `Object.is(oldStore, newStore)` always returns true
3. **Accessing observables creates tracking** - Reading `store.observable` inside render creates MobX reaction
4. **When observables change** → component re-renders → accesses observable → creates new useCallback → triggers re-render → **INFINITE LOOP**

## Test Coverage

The `code-quality.anti-patterns.spec.ts` test scans all `.ts` and `.tsx` files in `src/` for:

- ✅ Whole store objects in dependency arrays
- ✅ Observable arrays/objects in dependency arrays
- ✅ ESLint rule configuration

**Verified:** All 5 anti-patterns above are correctly detected and fail the test when present in `src/`.

## CI Integration

This test runs first in the CI pipeline (see `.github/workflows/test.yml`):

```yaml
code-quality → unit-tests → e2e-tests
```

This ensures anti-patterns are caught before wasting time on other tests.
