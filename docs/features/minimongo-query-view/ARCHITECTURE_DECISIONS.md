# Architecture Decision Records: Minimongo Query View

**Purpose:** Document critical design decisions that must be made before implementation.

**For LLMs:** Read this BEFORE implementing. These decisions impact the entire architecture.

---

## ADR-001: Collections Data Structure Refactor

**Status:** ⚠️ DECISION REQUIRED

**Context:**

Currently, `MinimongoStore.collections` is defined as:
```typescript
@observable collections: MinimongoCollections = {}
// MinimongoCollections = Record<string, IDocumentWrapper[]>
```

This works for storing documents, but the new feature requires storing:
- Documents (existing)
- Method logs (new)
- Schema (computed from documents)
- Query history (filtered method logs)
- Mutation history (filtered method logs)

**The Problem:**

`CollectionStore` class exists and has the infrastructure for all of this:
- `Searchable<IDocumentWrapper>` base (for documents)
- Can add `@observable methodLogs: IMethodLog[]`
- Can add `@computed get schema()`
- Can add `@computed get queries()`, `@computed get mutations()`

But the current architecture doesn't use CollectionStore instances in the main store.

**Options:**

### Option A: Parallel Data Structures (Low Risk)

Keep existing `collections` for documents, add new maps for logs:

```typescript
export class MinimongoStore {
  @observable collections: MinimongoCollections = {} // Documents only
  @observable collectionMethodLogs: Record<string, IMethodLog[]> = {}

  activeCollectionDocuments = new CollectionStore() // UI state only

  @action
  onMethodReceived(message: IMethodMessage) {
    if (!this.collectionMethodLogs[message.collectionName]) {
      this.collectionMethodLogs[message.collectionName] = []
    }
    this.collectionMethodLogs[message.collectionName].push({...})
  }

  @computed
  get activeSchema(): ISchema {
    if (!this.activeCollection) return {}
    const docs = this.collections[this.activeCollection].map(w => w.document)
    return inferSchema(docs)
  }
}
```

**Pros:**
- ✅ Minimal changes to existing code
- ✅ Low risk - existing functionality untouched
- ✅ Can implement incrementally

**Cons:**
- ❌ Duplicated logic (schema inference in store instead of CollectionStore)
- ❌ Two sources of truth for collection data
- ❌ CollectionStore becomes underutilized
- ❌ Future confusion: "Why do we have CollectionStore if we don't use it?"

**Impact:** +30 min implementation (simpler), +2 hours future refactoring debt

---

### Option B: Unified CollectionStore Architecture (High Risk, High Reward)

Refactor `collections` to use CollectionStore instances:

```typescript
export class MinimongoStore {
  @observable collections: Record<string, CollectionStore> = {}
  @observable activeCollection: string | null = null

  @computed
  get activeCollectionStore(): CollectionStore | null {
    return this.activeCollection ? this.collections[this.activeCollection] : null
  }

  @action
  setCollections(data: RawCollections) {
    const { requestId, ...rawCollections } = data

    this.collections = mapValues(rawCollections, (docs, collectionName) => {
      const store = new CollectionStore()
      const wrappers = docs.map(doc => MinimongoStore.wrapDocument(doc, collectionName))
      store.setCollection(wrappers)
      return store
    })
  }

  @action
  onMethodReceived(message: IMethodMessage) {
    const store = this.collections[message.collectionName]
    if (!store) return

    store.addMethodLog({
      method: message.method,
      args: EJSON.parse(message.args),
      stack: message.stack,
      timestamp: message.timestamp
    })
  }
}
```

**Pros:**
- ✅ Clean architecture - single source of truth
- ✅ CollectionStore becomes the domain model for a collection
- ✅ Schema, queries, mutations are computed properties on CollectionStore
- ✅ No duplicated logic
- ✅ Easier to add features in future (e.g., collection-specific settings)

**Cons:**
- ❌ Breaking change - many references to `collections[name][index]` become `collections[name].collection[index]`
- ❌ Requires updating all consumers of `collections`
- ❌ Risk of breaking existing functionality
- ❌ More testing required

**Impact:** +3-4 hours implementation (refactoring), -2 hours future debt (cleaner code)

---

### Option C: Hybrid Approach (Medium Risk)

Keep `collections` as-is, but create CollectionStore instances on-demand:

```typescript
export class MinimongoStore {
  @observable collections: MinimongoCollections = {} // Raw documents
  private collectionStores = new Map<string, CollectionStore>() // Cached stores

  getCollectionStore(name: string): CollectionStore {
    if (!this.collectionStores.has(name)) {
      const store = new CollectionStore()
      store.setCollection(this.collections[name] || [])
      this.collectionStores.set(name, store)
    }
    return this.collectionStores.get(name)!
  }

  @action
  setCollections(data: RawCollections) {
    // Update raw collections
    this.collections = { /* ... */ }

    // Sync to stores
    Object.keys(this.collections).forEach(name => {
      const store = this.getCollectionStore(name)
      store.setCollection(this.collections[name])
    })
  }

  @action
  onMethodReceived(message: IMethodMessage) {
    const store = this.getCollectionStore(message.collectionName)
    store.addMethodLog({...})
  }
}
```

**Pros:**
- ✅ Backward compatible - existing code works
- ✅ New code uses CollectionStore properly
- ✅ Gradual migration path

**Cons:**
- ❌ Complexity - two parallel structures that must stay in sync
- ❌ Cache invalidation issues (what if collections are replaced?)
- ❌ Memory overhead - storing data twice

**Impact:** +2 hours implementation, +1 hour future maintenance overhead

---

## Recommendation: Option B (Unified Architecture)

**Reasoning:**

This feature adds significant new functionality (method logs, schema). Doing it properly now prevents future tech debt.

**Why Option B:**
1. **Correctness:** Single source of truth eliminates sync bugs
2. **Maintainability:** Future developers understand one clear pattern
3. **Extensibility:** Adding new collection-level features is trivial
4. **Performance:** No duplicate data structures

**Migration Path:**

1. Create new `MinimongoStore` branch for refactor
2. Change `collections` type signature
3. Update `setCollections()` to create CollectionStore instances
4. Find all references: `grep -r "collections\[.*\]\." src/`
5. Update each reference:
   - `collections[name]` → `collections[name].collection`
   - `collections[name].length` → `collections[name].collection.length`
6. Run tests after each file update
7. Manual testing: verify existing Minimongo viewer still works
8. Merge refactor
9. Implement new feature on refactored base

**Risk Mitigation:**

- ✅ Small PRs - refactor first, feature second
- ✅ Test coverage - ensure existing tests still pass
- ✅ Manual QA - verify Minimongo panel works before/after
- ✅ Git branch - can revert if major issues

**If Short on Time:** Use Option A, document as tech debt, plan Option B for future sprint.

---

## ADR-002: Method Log Storage Limits

**Status:** ✅ DECIDED

**Context:**

Active Meteor apps can call `find()` hundreds of times per second. Storing unlimited logs will:
- Consume memory
- Slow down UI rendering
- Crash browser tab

**Decision:** Circular buffer with 1000 log limit per collection

```typescript
@action
addMethodLog(log: IMethodLog) {
  this.methodLogs.push(log)

  if (this.methodLogs.length > 1000) {
    this.methodLogs.shift() // Remove oldest
  }
}
```

**Alternatives Considered:**

- **Unlimited logs:** ❌ Memory leak
- **Time-based expiration (keep last 60 seconds):** ❌ Complex, not much better
- **User-configurable limit:** ⚠️ Good future enhancement, overkill for v1

**Rationale:**

- 1000 logs × ~500 bytes average = ~500KB per collection
- Typical app has 5-10 collections = 5MB total (acceptable)
- MobX only re-renders when array reference changes (push is efficient)
- Oldest logs are least useful (recent activity matters more)

---

## ADR-003: Message Throttling Strategy

**Status:** ✅ DECIDED

**Context:**

Without throttling, search-as-you-type triggers:
- 10 keystrokes/second
- Each keystroke → reactive query
- Each query → MINIMONGO_METHOD message
- 10 messages/second × 10 collections = 100 messages/second

**Decision:** Throttle message sending to 100ms (max 10/second)

```typescript
const throttledSendMethodLog = throttle((log: any) => {
  sendMessage('MINIMONGO_METHOD', log)
}, 100, { leading: true, trailing: true })
```

**Parameters:**
- `100ms` delay: Balance between responsiveness and performance
- `leading: true`: Send first message immediately (user sees instant feedback)
- `trailing: true`: Send last message after burst (don't lose final state)

**Alternatives Considered:**

- **Debounce (wait for quiet period):** ❌ Loses intermediate queries
- **No throttling:** ❌ Floods message channel
- **Server-side aggregation:** ❌ Too complex for v1

**Rationale:**

- 100ms is imperceptible to users (<16ms is single frame)
- `leading: true` prevents feeling "laggy"
- `trailing: true` ensures final state is captured
- Lodash throttle is battle-tested

---

## ADR-004: EJSON vs JSON for Serialization

**Status:** ✅ DECIDED

**Context:**

Meteor uses custom types:
- `Mongo.ObjectID` - Database IDs
- `Date` - Timestamps
- `Binary` - File data

Standard `JSON.stringify()` loses type information:
```javascript
JSON.stringify({_id: new Mongo.ObjectID()})
// Result: '{"_id": "abc123"}' ❌ Lost that it's an ObjectID
```

**Decision:** Use `EJSON.stringify()` / `EJSON.parse()`

```typescript
// In MinimongoInjector.ts (injected script)
const methodLog = {
  args: EJSON.stringify(arguments) // Preserves types
}

// In CollectionStore.ts (devtools panel)
const parsed = EJSON.parse(message.args) // Restores types
```

**Why EJSON:**
- ✅ Preserves Meteor type information
- ✅ Built into Meteor (no extra dependencies)
- ✅ Handles circular references (JSON.stringify doesn't)
- ✅ Consistent with existing codebase (see `CopyFormats.ts`)

**Alternatives Considered:**
- **JSON + custom replacer/reviver:** ❌ Reinventing wheel
- **Protobuf/MessagePack:** ❌ Overkill, adds dependencies

---

## ADR-005: Stack Trace Handling

**Status:** ✅ DECIDED

**Context:**

Stack traces provide critical debugging info (WHERE was query called), but:
- Can be 50-100 lines long
- Contain framework noise (Meteor internals, Blaze, Tracker)
- 10KB+ per log

**Decision:** Capture full stack, truncate in UI display

**Implementation:**

```typescript
// In MinimongoInjector.ts - capture full stack
const methodLog = {
  stack: new Error().stack || '' // Full stack
}

// In MethodLogDisplay.tsx - truncate for display
const displayStack = log.stack?.split('\n').slice(0, 5).join('\n')
```

**Why This Approach:**

- ✅ Preserve full data (user can inspect if needed)
- ✅ UI stays clean (only show top 5 frames by default)
- ✅ Collapsible UI (expand to see full stack)
- ✅ Framework noise is in bottom frames (slicing top 5 removes it)

**Alternatives Considered:**

- **Truncate at capture:** ❌ Loses data
- **Parse and filter stack frames:** ❌ Too complex, brittle
- **Server-side stack processing:** ❌ Not possible (no server in browser extension)

---

## ADR-006: Schema Inference Sampling

**Status:** ⚠️ DECISION REQUIRED

**Context:**

Collections can have 10,000+ documents. Iterating all documents on every schema computation is expensive.

**Options:**

### Option A: Sample First N Documents

```typescript
export function inferSchema(documents: any[], sampleSize = 1000): ISchema {
  const sample = documents.slice(0, sampleSize)
  // ... inference logic
}
```

**Pros:** Fast, simple
**Cons:** May miss fields that only appear in later documents

### Option B: Random Sampling

```typescript
function randomSample(arr: any[], n: number): any[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}
```

**Pros:** More representative sample
**Cons:** Non-deterministic, slower

### Option C: Scan All Documents

```typescript
export function inferSchema(documents: any[]): ISchema {
  // No sampling, iterate all
}
```

**Pros:** Accurate, complete schema
**Cons:** Slow for large collections

**Recommendation:** Start with Option C (scan all), optimize to Option A if performance issues arise.

**Rationale:**
- Most collections have <1000 documents
- Schema is `@computed` (only recalculates when documents change)
- Can add sampling later if needed
- Premature optimization is root of evil

---

## ADR-007: UI Layout - Tabs vs. Accordion

**Status:** ✅ DECIDED

**Context:**

Need to show:
1. Documents (existing)
2. Queries & Schema (new)

**Options:**
- **Tabs:** Side-by-side, one visible at a time
- **Accordion:** Vertical stack, multiple can be open
- **Split Pane:** Both visible simultaneously

**Decision:** Tabs (Blueprint `<Tabs>` component)

**Reasoning:**
- ✅ Consistent with DevTools pattern (Chrome DevTools uses tabs)
- ✅ Blueprint has excellent Tabs component
- ✅ Reduces visual clutter
- ✅ Keyboard navigation (Ctrl+Tab to switch)

**Alternatives Considered:**
- **Accordion:** ❌ Takes too much vertical space
- **Split Pane:** ❌ Each pane too cramped

---

## Summary for LLMs

**Before implementing, make these decisions:**

1. ⚠️ **ADR-001:** Choose collections data structure (Option B recommended)
2. ✅ **ADR-002:** Use 1000-log circular buffer
3. ✅ **ADR-003:** Throttle messages to 100ms
4. ✅ **ADR-004:** Use EJSON for serialization
5. ✅ **ADR-005:** Capture full stack, truncate in UI
6. ⚠️ **ADR-006:** Scan all documents for schema (optimize later if needed)
7. ✅ **ADR-007:** Use Tabs layout

**Most Critical:** ADR-001 (collections structure) - This affects the entire implementation. Decide this FIRST.

---

**Last Updated:** 2025-10-04
**Status:** Living Document
