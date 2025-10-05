# Architecture Decision Records: Minimongo Query View with DDP Correlation

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

## ADR-008: DDP Correlation Strategy (CRITICAL)

**Status:** ⚠️ DECISION REQUIRED - This is THE differentiator

**Context:**

The unique value of this feature is NOT just logging queries - it's correlating Minimongo activity with DDP server messages to validate truth.

**The Core Problem:**

Chrome DevTools can log Minimongo queries. But it CAN'T answer:
- "Is this document from the server or locally inserted?"
- "Is this data stale (subscription stopped but doc still in cache)?"
- "Does this query's result match what the server sent?"
- "Are there orphaned documents (subscription ended, doc still present)?"

**Why We Can Solve This:**

DDPStore already implements this pattern (proven in production):
- Tracks all DDP messages (added/changed/removed/ready/nosub)
- Maps subscriptions to sessions
- Correlates document lifecycle with server events
- 90% of infrastructure already exists

**The Opportunity:**

Copy DDPStore's correlation patterns to Minimongo:

| DDP Pattern (Proven) | Minimongo Pattern (New) |
|---------------------|------------------------|
| `DDPStore.getSubscriptionInit(sub)` | `MinimongoDDPCorrelator.findDocumentOrigin(doc)` |
| `DDPStore.subscriptionSessionMap` | `MinimongoDDPCorrelator.sessionSubscriptionMap` |
| `DDPLog.parsedContent.msg === 'added'` | Track doc origin via DDP 'added' messages |
| `DDPLog.timestamp` | Compare with query timestamp for freshness |

**Options:**

### Option A: Query Logging Only (Chrome DevTools Can Do This)

```typescript
class CollectionStore {
  @observable methodLogs: IMethodLog[] = []

  @action
  addMethodLog(log: IMethodLog) {
    this.methodLogs.push(log)
  }

  @computed
  get queries() {
    return this.methodLogs.filter(log => log.method === 'find')
  }
}
```

**Pros:**
- ✅ Simple, fast implementation (4-6 hours)
- ✅ Low risk

**Cons:**
- ❌ NOT UNIQUE - Chrome DevTools can do this
- ❌ Doesn't validate truth against server
- ❌ Can't detect stale data
- ❌ Can't find orphaned documents
- ❌ Wastes the DDP infrastructure we already have

**Impact:** 4-6 hours implementation, but delivers commodity feature

---

### Option B: Full DDP Correlation (10x More Value)

```typescript
class MinimongoDDPCorrelator {
  constructor(
    private ddpStore: DDPStore,
    private minimongoStore: MinimongoStore
  ) {}

  /**
   * Find which DDP message/subscription brought this document
   */
  findDocumentOrigin(doc: IDocument, collection: string): {
    subscription: IMeteorSubscription | null
    ddpMessage: DDPLog | null
    timestamp: number
  } {
    // Find 'added' message for this doc
    const addedLog = this.ddpStore.collection.find(
      log => log.parsedContent.msg === 'added' &&
             log.parsedContent.collection === collection &&
             log.parsedContent.id === doc._id
    )

    if (!addedLog) {
      return { subscription: null, ddpMessage: null, timestamp: 0 }
    }

    // Map session → subscription
    const subId = this.ddpStore.subscriptionSessionMap.get(addedLog.parsedContent.session)
    const subscription = subId ? this.ddpStore.subscriptions.get(subId) : null

    return {
      subscription,
      ddpMessage: addedLog,
      timestamp: addedLog.timestamp
    }
  }

  /**
   * Check if document data is stale
   */
  getDataFreshness(doc: IDocument, collection: string): {
    lastServerUpdate: number | null
    age: number
    isStale: boolean
  } {
    const changedLog = this.ddpStore.collection
      .filter(log =>
        log.parsedContent.msg === 'changed' &&
        log.parsedContent.collection === collection &&
        log.parsedContent.id === doc._id
      )
      .sort((a, b) => b.timestamp - a.timestamp)[0]

    const lastUpdate = changedLog?.timestamp || 0
    const age = Date.now() - lastUpdate

    return {
      lastServerUpdate: lastUpdate || null,
      age,
      isStale: age > 5000 // >5s since server update
    }
  }

  /**
   * Validate query results against server data
   */
  validateQuery(query: IMethodLog, results: IDocument[]): {
    hasServerData: boolean
    serverDocCount: number
    orphanedDocs: IDocument[]
    coverage: number // % of results that came from server
  } {
    const origins = results.map(doc =>
      this.findDocumentOrigin(doc, query.collection)
    )

    const serverDocs = origins.filter(o => o.subscription !== null)
    const orphaned = results.filter((_, i) => origins[i].subscription === null)

    return {
      hasServerData: serverDocs.length > 0,
      serverDocCount: serverDocs.length,
      orphanedDocs: orphaned,
      coverage: (serverDocs.length / results.length) * 100
    }
  }

  /**
   * Detect unnecessary queries (result already in cache from subscription)
   */
  detectUnnecessaryQuery(query: IMethodLog): {
    isUnnecessary: boolean
    reason: string | null
    subscriptionProviding: IMeteorSubscription | null
  } {
    // Complex logic: check if active subscription already provides this data
    // This requires understanding Meteor's selector matching
    // MVP: Flag if ALL results came from server (100% coverage)

    const validation = this.validateQuery(query, query.results)

    if (validation.coverage === 100) {
      return {
        isUnnecessary: true,
        reason: 'All results already available from active subscription',
        subscriptionProviding: validation.serverDocCount > 0 ?
          this.findDocumentOrigin(query.results[0], query.collection).subscription :
          null
      }
    }

    return {
      isUnnecessary: false,
      reason: null,
      subscriptionProviding: null
    }
  }
}
```

**Implementation in CollectionStore:**

```typescript
export class CollectionStore extends Searchable<IDocumentWrapper> {
  @observable methodLogs: IMethodLog[] = []
  private correlator: MinimongoDDPCorrelator

  constructor(correlator: MinimongoDDPCorrelator) {
    super()
    this.correlator = correlator
  }

  @computed
  get queriesWithOrigin() {
    return this.queries.map(query => ({
      ...query,
      validation: this.correlator.validateQuery(query, query.results),
      isUnnecessary: this.correlator.detectUnnecessaryQuery(query).isUnnecessary
    }))
  }

  @computed
  get documentsWithFreshness() {
    return this.collection.map(wrapper => ({
      ...wrapper,
      freshness: this.correlator.getDataFreshness(wrapper.document, wrapper.collectionName),
      origin: this.correlator.findDocumentOrigin(wrapper.document, wrapper.collectionName)
    }))
  }
}
```

**Pros:**
- ✅ UNIQUE VALUE - No other tool does this
- ✅ Validates client state against server reality
- ✅ Detects stale data, orphaned docs, unnecessary queries
- ✅ Reuses 90% existing infrastructure (DDPStore)
- ✅ Pattern proven in production (copy DDPInjector)
- ✅ Positions tool as "Truth Validator" not just "Query Logger"

**Cons:**
- ❌ More complex (+4 hours: 10-14 total vs 6-8 for Option A)
- ❌ Requires understanding DDP message flow
- ❌ Session→Subscription mapping has edge cases

**Impact:** 10-14 hours implementation, but delivers 10x more value

---

### Option C: Partial Correlation (Compromise)

Start with Option A, add correlation features incrementally:

**Phase 1 (6-8 hours):** Query logging only
**Phase 2 (4-6 hours):** Add document origin tracking
**Phase 3 (2-4 hours):** Add freshness detection
**Phase 4 (2-4 hours):** Add query validation

**Pros:**
- ✅ Delivers value quickly
- ✅ Lower risk (incremental)
- ✅ Can stop at any phase if time runs out

**Cons:**
- ❌ Total time same or more (coordination overhead)
- ❌ Risk of never completing correlation (feature creep)
- ❌ Each phase requires separate testing

**Impact:** 14-22 hours total (more than Option B due to overhead)

---

## Recommendation: Option B (Full Correlation)

**Reasoning:**

This feature's ENTIRE VALUE PROPOSITION is DDP correlation. Without it, we're building a worse version of Chrome DevTools.

**Why Option B:**

1. **Differentiation:** This is what makes the tool unique. Chrome DevTools can't do this.

2. **Infrastructure Exists:** DDPStore already implements this pattern:
   ```typescript
   // ALREADY EXISTS (proven):
   DDPStore.getSubscriptionInit(subscription)
   DDPStore.subscriptionSessionMap
   DDPStore.collection.filter(log => log.parsedContent.msg === 'added')

   // JUST COPY THE PATTERN:
   MinimongoDDPCorrelator.findDocumentOrigin(doc)
   MinimongoDDPCorrelator.sessionSubscriptionMap
   ```

3. **Effort is Justified:** +4 hours to deliver 10x more value is a good trade.

4. **Technical Feasibility:** DDPInjector proves the wrapping pattern works. We're not inventing anything new.

5. **User Value:** Developers NEED this. "Is my data stale?" is a critical debugging question.

**Implementation Priority:**

1. **PHASE 0:** Read `DDPStore.ts` and `DDPInjector.ts` - Understand correlation patterns (1 hour)
2. **PHASE 1:** Implement `MinimongoDDPCorrelator.findDocumentOrigin()` (2-3 hours)
3. **PHASE 2:** Implement `MinimongoDDPCorrelator.getDataFreshness()` (1-2 hours)
4. **PHASE 3:** Implement `MinimongoDDPCorrelator.validateQuery()` (2-3 hours)
5. **PHASE 4:** Wire up UI to show correlation data (2-3 hours)
6. **PHASE 5:** Testing and polish (2 hours)

**Total Estimate:** 10-14 hours

**Critical Success Factor:** Copy DDPStore patterns. Don't reinvent. The hard work is already done.

**If Short on Time:** Implement Phase 1-2 (document origin + freshness). Skip Phase 3-4 (query validation). Still delivers unique value.

---

## ADR-009: Session to Subscription Mapping

**Status:** ✅ DECIDED (Copy DDPStore Pattern)

**Context:**

DDP messages use `session` IDs, but subscriptions use `id` (subId). To correlate documents with subscriptions, we need to map session → subId.

**Problem:**

```typescript
// DDP 'added' message has session
{
  msg: 'added',
  session: 'abc123',
  collection: 'users',
  id: 'user456'
}

// But subscription has different ID
{
  msg: 'sub',
  id: 'sub789', // NOT the session ID
  name: 'users.find'
}
```

**How do we know session 'abc123' belongs to subscription 'sub789'?**

**Solution:** Use 'ready' messages (DDPStore already does this)

```typescript
// 'ready' message links them
{
  msg: 'ready',
  session: 'abc123',
  subs: ['sub789'] // <-- The mapping!
}
```

**Implementation (Copy from DDPStore):**

```typescript
export class MinimongoDDPCorrelator {
  @computed
  get sessionSubscriptionMap(): Map<string, string> {
    const map = new Map<string, string>()

    this.ddpStore.collection
      .filter(log => log.parsedContent.msg === 'ready')
      .forEach(log => {
        const session = log.parsedContent.session
        const subs = log.parsedContent.subs || []

        subs.forEach(subId => {
          map.set(session, subId)
        })
      })

    return map
  }

  findDocumentOrigin(doc: IDocument, collection: string) {
    const addedLog = this.ddpStore.collection.find(
      log => log.parsedContent.msg === 'added' &&
             log.parsedContent.collection === collection &&
             log.parsedContent.id === doc._id
    )

    if (!addedLog) return { subscription: null, ... }

    // Use the mapping
    const session = addedLog.parsedContent.session
    const subId = this.sessionSubscriptionMap.get(session)
    const subscription = subId ? this.ddpStore.subscriptions.get(subId) : null

    return { subscription, ... }
  }
}
```

**Why This Works:**

- ✅ DDP protocol guarantees 'ready' message after subscription data sent
- ✅ DDPStore already implements this pattern (battle-tested)
- ✅ MobX @computed ensures efficient caching
- ✅ Handles edge cases (subscription can have multiple sessions)

**Alternatives Considered:**

- **Store session in subscription object:** ❌ Breaks DDP message structure
- **Manual tracking in injector:** ❌ Duplicates DDPStore logic
- **Guess based on timing:** ❌ Unreliable

**Critical Pitfall to Avoid:**

```typescript
// WRONG - subscription.id is NOT the session
const subId = addedLog.parsedContent.session // ❌

// RIGHT - use ready message to map session → subId
const subId = this.sessionSubscriptionMap.get(addedLog.parsedContent.session) // ✅
```

---

## ADR-010: Correlation Performance Optimization

**Status:** ✅ DECIDED

**Context:**

Correlation requires searching DDPStore logs (can be 1000+ messages). Naive implementation:

```typescript
findDocumentOrigin(doc: IDocument, collection: string) {
  // ❌ O(n) search on every call
  return this.ddpStore.collection.find(log =>
    log.parsedContent.msg === 'added' &&
    log.parsedContent.collection === collection &&
    log.parsedContent.id === doc._id
  )
}
```

If displaying 100 documents, this is 100 × 1000 = 100,000 iterations (slow).

**Decision:** Use MobX @computed with indexing

**Implementation:**

```typescript
export class MinimongoDDPCorrelator {
  /**
   * Index: collection+docId → DDP log
   * Computed property ensures automatic updates when DDPStore changes
   */
  @computed
  get documentOriginIndex(): Map<string, DDPLog> {
    const index = new Map<string, DDPLog>()

    this.ddpStore.collection
      .filter(log => log.parsedContent.msg === 'added')
      .forEach(log => {
        const key = `${log.parsedContent.collection}::${log.parsedContent.id}`
        index.set(key, log)
      })

    return index
  }

  findDocumentOrigin(doc: IDocument, collection: string) {
    const key = `${collection}::${doc._id}`
    const addedLog = this.documentOriginIndex.get(key) // ✅ O(1) lookup

    // ... rest of logic
  }
}
```

**Why This Works:**

- ✅ O(1) lookups instead of O(n) searches
- ✅ MobX @computed caches the index (only rebuilds when DDPStore changes)
- ✅ Memory efficient (~100 bytes per document × 1000 docs = 100KB)
- ✅ Handles updates automatically (reactive)

**Performance Comparison:**

| Approach | 100 Documents | 1000 Documents |
|----------|--------------|----------------|
| Naive O(n) | ~10ms | ~100ms |
| Indexed O(1) | ~1ms | ~1ms |

**Applies To:**

- `documentOriginIndex` - Map doc to 'added' message
- `documentFreshnessIndex` - Map doc to latest 'changed' message
- `sessionSubscriptionMap` - Map session to subId (already @computed)

**Critical Pattern:**

```typescript
// ✅ DO THIS - Index in @computed, lookup in regular method
@computed get myIndex() { /* build index */ }
findThing(id) { return this.myIndex.get(id) }

// ❌ DON'T DO THIS - Search in regular method
findThing(id) { return this.array.find(x => x.id === id) }
```

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
8. ⚠️ **ADR-008:** **DDP Correlation Strategy (CRITICAL) - Option B recommended**
9. ✅ **ADR-009:** Use 'ready' messages for session→subscription mapping (copy DDPStore)
10. ✅ **ADR-010:** Use MobX @computed with indexing for O(1) correlation lookups

**Most Critical Decision:** ADR-008 (DDP Correlation) - This IS the feature. Without it, we're building a commodity tool.

**Implementation Estimate:** 10-14 hours (with correlation) vs 6-8 hours (without correlation)

**ROI Analysis:** +4 hours for 10x more value = good trade

**Pattern to Copy:** DDPStore + DDPInjector (proven in production, 90% infrastructure exists)

---

**Last Updated:** 2025-10-04
**Status:** Living Document
