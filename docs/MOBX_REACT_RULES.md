# MobX + React Integration Rules

## Root Cause
Mixing MobX observables with React hooks creates reaction loops:
- Observable references stay stable even when contents change
- React's `Object.is()` can't detect content changes
- Reading observables inside memo/effect bodies creates MobX tracking inside React cache scopes
- Result: infinite loops, stale caches, performance death

## Mandatory Patterns

### ✅ DO: Use MobX `@computed` for all data derivations

```ts
// In Store
@computed
get filteredLogs(): LogEntry[] {
  return this.logs
    .filter(log => this.filters[log.method])
    .filter(log => log.collectionName.includes(this.search))
}

// In Component (observer)
const processedLogs = minimongoStore.filteredLogs  // Just read it
```

### ✅ DO: Use `untracked()` for snapshots in memos

```ts
import { untracked } from 'mobx'

const result = useMemo(() => {
  const snapshot = untracked(() => store.collection.slice())
  return expensiveComputation(snapshot)
}, [logs, store.collection.length])  // Primitive dep
```

### ✅ DO: Depend on primitives, not observable objects

```ts
// BAD
useMemo(() => {...}, [store.collection])

// GOOD
const collectionLength = store.collection.length
useMemo(() => {...}, [collectionLength])
```

### ❌ DON'T: Put observables in hook dependency arrays

```ts
// WRONG - infinite loop
useMemo(() => store.items.filter(...), [store.items])
useEffect(() => {...}, [store.collection])
useCallback(() => {...}, [minimongoStore.methodLogs])

// WRONG - entire store object triggers on ANY observable change
useCallback(() => {
  panelStore.setTab('DDP')
}, [panelStore])  // ❌ Whole store

// WRONG - observable properties change reference on every mutation
useCallback(() => {
  navigate(log.collectionName)
}, [log.collectionName])  // ❌ Property from observable object

// CORRECT - only use action methods (stable refs) or primitives
useCallback(() => {
  panelStore.setTab('DDP')
}, [panelStore.setTab])  // ✅ Action method

// CORRECT - don't use useCallback at all for simple event handlers
const handleClick = () => {
  panelStore.setTab('DDP')  // ✅ No deps needed
}
```

### ❌ DON'T: Read observables inside memo/effect bodies

```ts
// WRONG - creates tracked read inside React cache
useMemo(() => {
  return store.collection.filter(...)  // MobX tracking!
}, [someOtherDep])
```

### ❌ DON'T: Use `// eslint-disable-next-line` to paper over violations

Fix the architecture, don't silence the alarm.

**Exception:** When intentionally using only MobX action methods (not entire stores) in deps, you may need to disable exhaustive-deps:
```ts
// Acceptable use - we intentionally exclude the store object
const handleFilter = useCallback(
  (type) => settingStore.setFilter(type, true),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [settingStore.setFilter]  // ✅ Action only, not settingStore
)
```

### ✅ DO: Question if you need useCallback at all

From React docs: "You only need useCallback when you pass a callback to an optimized child component."

```ts
// DON'T need useCallback for:
// - onClick/onChange handlers in the same component
// - Functions not passed to children

// ❌ Over-optimized - caused infinite loop
const handleClick = useCallback(() => {
  doSomething(log.property)
}, [log.property])

// ✅ Simple is better
const handleClick = () => {
  doSomething(log.property)
}
```

## Required Tests

### 1. Mutation without length change
```ts
test('UI updates when log field changes without length change', () => {
  store.methodLogs[0].runtime = 999
  expect(screen.getByText('999ms')).toBeInTheDocument()
})
```

### 2. Render performance soak
```ts
test('handles 50k events with filter toggling', async () => {
  const start = performance.now()
  for (let i = 0; i < 50000; i++) {
    store.addMethodLog(mockLog())
    if (i % 200 === 0) store.toggleFilter('find')
  }
  const duration = performance.now() - start
  expect(duration).toBeLessThan(5000)  // p95 budget
})
```

### 3. Observer boundary isolation
```ts
test('child observer updates don\'t cascade', () => {
  const recomputeCount = jest.fn()
  autorun(() => {
    recomputeCount()
    minimongoStore.filteredLogs.length
  })

  // Update unrelated store
  ddpStore.addMessage(mockDDP())

  expect(recomputeCount).toHaveBeenCalledTimes(1)  // No cascade
})
```

## CI Enforcement

### ESLint rules (must be `error`, not `warn`)
```js
rules: {
  'react-hooks/exhaustive-deps': 'error',
  'no-useless-catch': 0,
  'prettier/prettier': ['error', { endOfLine: 'auto' }],
}
```

### Grep checks in CI
```bash
# Fail if any observable in hook deps
rg -n "use(Memo|Effect|Callback|LayoutEffect)\s*\([^)]*?\[[^\]]*\b\w+Store\.\w+[^\]]*\]" src && exit 1

# Fail if useMemo reads observables
rg -n "useMemo\s*\(\s*\(\)\s*=>[\s\S]{0,400}?\b\w+Store\.\w+" src && exit 1
```

### Performance budgets
```yaml
# Add to CI
- name: Soak test
  run: yarn test:soak
  timeout: 10m
  fail-on: p95 > 32ms || heap-slope > 0
```

## Architecture Boundaries

### Enforce selector imports only
```js
// .eslintrc.js
'no-restricted-imports': ['error', {
  patterns: [{
    group: ['@/Stores/**'],
    importNames: ['*'],
    message: 'Import from @/Selectors/* instead. UI must not touch stores directly.'
  }]
}]
```

### Create selector layer
```ts
// src/Selectors/QueryLogSelectors.ts
import { minimongoStore } from '@/Stores/Panel/MinimongoStore'

export const useFilteredLogs = () => minimongoStore.filteredMethodLogs
export const useLogFilters = () => minimongoStore.queryLogFilters
export const useLogSearch = () => minimongoStore.queryLogSearch
```

## Performance Requirements

1. **Virtualize all lists** - No exceptions for >100 items
2. **Debounce search** - 150ms minimum
3. **Ring buffer** - Hard cap at 1000 entries
4. **No array copies in render** - Use `computed` or `untracked` snapshot in memo

## Violations Found & Fixed

| File | Issue | Fix |
|------|-------|-----|
| QueryLogWaterfall.tsx:251 | `ddpStore.collection` read inside memo | `untracked()` snapshot |
| Minimongo.tsx:78 | `minimongoStore.collections` in effect | Convert to Set outside effect |
| QueryLog.tsx | Filtering in useMemo | Moved to store `@computed` |
| ExportDialog.tsx:160 | `generatePreview` recreated every render | `useCallback` with stable deps |
| **QueryLogDetail.tsx:402-407** | **`useCallback` with `[panelStore, log.property]`** | **Removed useCallback - simple handlers** |
| **BookmarksStatus.tsx:20** | **`useCallback` with `[settingStore]`** | **Changed to `[settingStore.setFilter]`** |
| **DDPStatus.tsx:24** | **`useCallback` with `[settingStore]`** | **Changed to `[settingStore.setFilter]`** |
| **QueryLog.tsx:113** | **`useCallback` with `[minimongoStore]`** | **Changed to `[minimongoStore.setQueryLogFilter]`** |
| **ExportDialog.tsx:150-160** | **Observable properties in deps** | **Changed to action methods only** |

## Reference Implementation

See `src/Pages/Panel/QueryLog/QueryLog.tsx` and `src/Stores/Panel/MinimongoStore/index.ts:filteredMethodLogs` for the correct pattern.
