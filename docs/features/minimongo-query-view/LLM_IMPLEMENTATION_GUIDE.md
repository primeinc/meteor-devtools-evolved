# LLM Implementation Guide: Minimongo Query View with DDP Correlation

**Purpose:** This document helps LLMs (or developers) quickly understand the codebase context needed to implement the Minimongo Query View feature WITH DDP correlation for truth validation.

**Status:** Feature is 0% implemented. This is a complete feature addition with correlation layer.

**Estimated Effort:** 10-14 hours across 15 files (12 new, 3 modified)

---

## 🎯 Implementation Strategy

**Critical Success Factor:** This feature's UNIQUE VALUE is DDP correlation. Chrome DevTools shows queries, but we show TRUTH (client vs server validation).

**What Makes This Different:**
- NOT just logging queries (that's easy)
- NOT just showing data (Minimongo tab already does that)
- **VALIDATING** client state against server reality (DDP messages)
- **DETECTING** unnecessary queries, stale data, orphaned documents
- **TRACING** data flow from server → subscription → Minimongo → query

**Order of Operations:**
1. Read prerequisite files (understand existing systems)
2. Study DDP pattern (already working, copy it)
3. Study correlation opportunities (DDP + Minimongo = truth)
4. Implement query capture (backend)
5. Implement correlation service (the key innovation)
6. Build UI with validation (presentation)
7. Test integration (verify truth checking works)

---

## 📚 PHASE 0: Read These Files First (In Order)

### 1. **Message Bridge Architecture** (20 minutes)

#### Read: `src/Browser/Inject.ts` (lines 1-50, focus on Registry pattern)
**Why:** Understand message passing between injected script and devtools panel.
**Key Concepts:**
- `Registry.register(messageName, handler)` - Message handlers
- `sendMessage(messageName, data)` - Send to panel
- `getStackTrace(limit)` - **Already exists!** Captures call stack

**Reasoning:** Query capture AND DDP correlation both use this infrastructure.

---

#### Read: `src/Utils/BridgeAdapter.ts` (entire file)
**Why:** Panel-side message handler.
**Key Concepts:**
- `BridgeAdapter.on(messageName, callback)` - Listen for messages
- Event-based pub/sub pattern

**Reasoning:** MinimongoStore will listen for `minimongo-method` messages, same pattern as DDPStore listens for `ddp-event`.

---

### 2. **DDP Implementation** (45 minutes - CRITICAL)

#### Read: `src/Injectors/DDPInjector.ts` (entire file - 32 lines)
**Why:** This is your TEMPLATE. Copy this pattern exactly for Minimongo.
**Key Concepts:**
```typescript
// DDP intercepts stream.send
const send = Meteor.connection._stream.send
Meteor.connection._stream.send = function (...args) {
  send.apply(this, args)  // Call original
  callback({
    id: generateId(),
    content: args[0],
    isOutbound: true,
    timestamp: Date.now()
  })
}

// YOUR IMPLEMENTATION (nearly identical):
// Minimongo intercepts collection methods
const original = collection.find
collection.find = function(...args) {
  const result = original.apply(this, args)  // Call original
  sendMessage('minimongo-method', {
    id: generateId(),
    collection: collection.name,
    method: 'find',
    args: EJSON.stringify(args),
    timestamp: Date.now()
  })
  return result
}
```

**Reasoning:** DDPInjector proves this pattern works. Don't reinvent - copy it.

---

#### Read: `src/Stores/Panel/DDPStore.ts` (entire file - 104 lines)
**Why:** This is your MobX store template AND your correlation data source.
**Key Concepts:**
- `@observable collection: DDPLog[]` - Stores messages
- `@computed get subscriptionLogs()` - Filters by message type
- `getSubscriptionMeta(subscription)` - Cross-references DDP + Subscription data
- **IMPORTANT:** DDPStore already does correlation! (lines 77-102)

**Correlation Pattern to Copy:**
```typescript
// DDPStore correlates subscription with DDP messages
getSubscriptionInit(subscription) {
  return this.subscriptionLogs.find(
    log => log.parsedContent.id === subscription.id
  )
}

getSubscriptionDuration(subscription) {
  const initLog = this.getSubscriptionInit(subscription)
  const readyLog = this.getSubscriptionReady(subscription)

  if (initLog && readyLog)
    return `${readyLog.timestamp - initLog.timestamp}ms`
  // ...
}

// YOUR IMPLEMENTATION (similar):
// MinimongoStore correlates documents with DDP messages
findDocumentOrigin(doc: IDocument, collection: string) {
  return this.ddpStore.collection.find(
    log => log.parsedContent.msg === 'added' &&
           log.parsedContent.collection === collection &&
           log.parsedContent.id === doc._id
  )
}
```

**Reasoning:** DDPStore.getSubscriptionMeta() is ALREADY doing correlation. You're extending this pattern to Minimongo.

---

#### Read: `src/Utils/MessageFormatter.ts` (entire file - 78 lines)
**Why:** Understand DDP message structure (your correlation source).
**Key Concepts:**
```typescript
interface DDPLogContent {
  msg?: string  // 'added' | 'changed' | 'removed' | 'sub' | 'ready'
  collection?: string
  id?: string  // Document _id
  fields?: object  // Document data
  session?: string
  subs?: string[]
}
```

**Critical for Correlation:**
- `msg: 'added'` → Document was sent from server
- `msg: 'changed'` → Document was updated
- `msg: 'removed'` → Document was deleted
- `collection + id` = unique document identifier

**YOUR USAGE:**
```typescript
// Match Minimongo document to DDP 'added' message
const ddpAdded = ddpStore.collection.find(log =>
  log.parsedContent.msg === 'added' &&
  log.parsedContent.collection === collectionName &&
  log.parsedContent.id === doc._id
)

if (ddpAdded) {
  // Document has server origin!
  return {
    origin: 'server',
    timestamp: ddpAdded.timestamp,
    subscription: /* trace via session */
  }
}
```

**Reasoning:** DDP message format is your correlation key. Understanding this is critical.

---

### 3. Current Minimongo Implementation (30 minutes)

#### Read: `src/Injectors/MinimongoInjector.ts` (entire file - 101 lines)
**Why:** You'll extend THIS file with method wrapping.
**Key Concepts:**
- `getCollections()` - Snapshots all collections
- `cleanup()` - Serializes Meteor objects
- `updateCollections()` - Throttled function

**What You'll Add:**
```typescript
// NEW functions in this file
function wrapMethod(collection, methodName) { /* ... */ }
function discoverCollections() { /* ... */ }

export const MinimongoInjector = () => {
  Registry.register('minimongo-get-collections', (message) => {
    getCollections(message.data)
  })

  // NEW: Start method interception
  discoverCollections()
}
```

---

#### Read: `src/Injectors/MeteorAdapter.ts` (lines 23-44)
**Why:** THIS ALREADY WRAPS MINIMONGO METHODS! Study the pattern.
**Key Discovery:**
```typescript
Object.entries(Mongo.Collection.prototype).forEach(([key, val]) => {
  if (['find', 'findOne', 'insert', 'update', 'upsert', 'remove'].includes(key)) {
    const original = prototype[key]

    prototype[key] = function (...args) {
      const startMs = Date.now()
      const result = original.apply(this, args)

      sendMessage('meteor-data-performance', {
        collectionName: this._name,
        key,
        args: JSON.stringify(args),
        runtime: Date.now() - startMs
      })

      return result
    }
  }
})
```

**This Proves:**
- ✅ Method wrapping works
- ✅ Doesn't break Meteor
- ✅ Pattern is production-tested

**Your Implementation:**
- Copy this pattern
- Add stack trace capture: `trace: getStackTrace(10)`
- Use EJSON instead of JSON: `args: EJSON.stringify(args)`
- Send different message: `minimongo-method` instead of `meteor-data-performance`

---

#### Read: `src/Stores/Panel/MinimongoStore/index.ts` (entire file - 129 lines)
**Why:** You'll extend this with correlation methods.
**Key Concepts:**
- `@observable collections` - Document storage
- `@computed properties` - Derived state
- `setCollections()` - Handles incoming data

**What You'll Add:**
```typescript
export class MinimongoStore {
  // Existing
  @observable collections: MinimongoCollections = {}
  @observable activeCollection: string | null = null

  // NEW: Correlation infrastructure
  correlator: MinimongoDDPCorrelator  // Inject in constructor

  // NEW: Computed properties with correlation
  @computed
  get activeCollectionWithOrigins() {
    if (!this.activeCollection) return []

    return this.collections[this.activeCollection].map(docWrapper => ({
      ...docWrapper,
      origin: this.correlator.findDocumentOrigin(
        docWrapper.document,
        this.activeCollection
      )
    }))
  }
}
```

---

### 4. Subscription Tracking (15 minutes - NEW for Correlation)

#### Read: `src/Stores/Panel/SubscriptionStore.ts` (entire file - 20 lines)
**Why:** Subscriptions are part of correlation chain (DDP → Subscription → Document).
**Key Concepts:**
```typescript
interface IMeteorSubscription {
  id: string
  name: string
  params: any[]
  inactive: boolean
  ready: boolean
}
```

**Correlation Chain:**
```
Subscription "activeUsers" (id: "abc123")
  ↓ (via DDP session)
DDP {msg: 'added', collection: 'Users', id: 'xyz789'}
  ↓ (stored in Minimongo)
Document {_id: 'xyz789', name: 'John'}
  ↓ (queried by)
Query Users.find({name: 'John'})
```

**Your Task:** Build reverse lookup (Document → Subscription).

---

#### Read: `src/Pages/Panel/Subscriptions/Subscriptions.tsx` (lines 39-67)
**Why:** See how subscriptions are displayed and correlated with DDP.
**Key Pattern:**
```typescript
const subscriptions = sortBy(
  panelStore.subscriptionStore.subsWithMeta,
  'meta.init.timestamp'
)

// subsWithMeta is ALREADY doing correlation:
@computed
get subsWithMeta() {
  return this.filtered.map(sub => ({
    ...sub,
    ...PanelStore.ddpStore.getSubscriptionMeta(sub)  // <-- Correlation!
  }))
}
```

**Reasoning:** This proves correlation is already happening. You're extending it to documents.

---

### 5. UI Patterns (20 minutes)

#### Read: `src/Pages/Panel/DDP/DDPLog.tsx` (entire file)
**Why:** Template for MethodLogDisplay component.
**Key Concepts:**
- Stack trace rendering
- Collapsible sections
- Blueprint Card components

---

## 🏗️ PHASE 1: Understand Correlation Opportunities

### Correlation Type 1: Document Origin

**Question:** Where did this document come from?

**Data Sources:**
- MinimongoStore.collections - Current documents
- DDPStore.collection - All DDP messages (filtered for `msg: 'added'`)
- SubscriptionStore.collection - Active subscriptions

**Correlation Logic:**
```typescript
function findDocumentOrigin(doc: IDocument, collectionName: string) {
  // Step 1: Find DDP 'added' message
  const addedMessage = ddpStore.collection.find(log =>
    log.parsedContent.msg === 'added' &&
    log.parsedContent.collection === collectionName &&
    log.parsedContent.id === doc._id
  )

  if (!addedMessage) {
    return { origin: 'local' } // Client-side insert
  }

  // Step 2: Trace to subscription (HARD PART)
  // DDP messages have 'session' field, subscriptions have 'id'
  // Need to build session → subscription mapping

  return {
    origin: 'server',
    ddpMessage: addedMessage,
    subscription: /* TBD: requires session tracking */
  }
}
```

**Challenge:** DDP messages have `session`, subscriptions have `id`. These are different!

**Solution:** Build mapping when subscription becomes ready:
```typescript
// In DDPStore
@computed
get subscriptionSessionMap(): Map<string, string> {
  const map = new Map<string, string>()

  this.collection
    .filter(log => log.parsedContent.msg === 'ready')
    .forEach(log => {
      // 'ready' message has both session and subs
      log.parsedContent.subs?.forEach(subId => {
        map.set(log.parsedContent.session, subId)
      })
    })

  return map
}
```

---

### Correlation Type 2: Data Freshness

**Question:** Is this data stale?

**Data Sources:**
- DDPStore.collection - DDP `changed` messages with timestamps
- Current time

**Correlation Logic:**
```typescript
function getDataFreshness(doc: IDocument, collectionName: string) {
  // Find most recent 'changed' message
  const changedMessages = ddpStore.collection
    .filter(log =>
      log.parsedContent.msg === 'changed' &&
      log.parsedContent.collection === collectionName &&
      log.parsedContent.id === doc._id
    )
    .sort((a, b) => b.timestamp - a.timestamp)

  const lastChanged = changedMessages[0]

  if (!lastChanged) {
    return { age: null, isStale: false }
  }

  const age = Date.now() - lastChanged.timestamp

  return {
    age,
    isStale: age > 5000, // Stale if > 5 seconds old
    lastUpdate: lastChanged.timestamp
  }
}
```

---

### Correlation Type 3: Query Validation

**Question:** Does this query return server-backed data?

**Data Sources:**
- Query results (documents from Minimongo)
- DDP `added` messages

**Correlation Logic:**
```typescript
function validateQuery(query: IMethodLog, results: IDocument[]) {
  // Check if all results have DDP origin
  const validated = results.map(doc => ({
    doc,
    hasServerOrigin: !!findDocumentOrigin(doc, query.collection)
  }))

  const serverBacked = validated.filter(v => v.hasServerOrigin).length
  const orphaned = validated.filter(v => !v.hasServerOrigin)

  return {
    hasServerData: serverBacked > 0,
    serverDocCount: serverBacked,
    orphanedDocs: orphaned.map(v => v.doc),
    coverage: serverBacked / results.length
  }
}
```

---

### Correlation Type 4: Unnecessary Queries

**Question:** Is this query running but returning no server data?

**Correlation Logic:**
```typescript
function findUnnecessaryQueries() {
  return methodLogs
    .filter(log => log.method === 'find' || log.method === 'findOne')
    .map(query => {
      // Evaluate query against current Minimongo
      const results = evaluateQuery(query) // Complex!
      const validation = validateQuery(query, results)

      return {
        query,
        isUnnecessary: validation.serverDocCount === 0
      }
    })
    .filter(q => q.isUnnecessary)
}
```

**Challenge:** Evaluating query against Minimongo is complex (need to apply selector logic).

**Simple Alternative:** Just flag queries that run frequently with no documents in the collection.

---

## 🔧 PHASE 2: Implementation Checklist

### Step 1: Add TypeScript Interfaces (20 min)

**File:** Add to `src/index.d.ts` or create `src/types/MinimongoTypes.ts`

```typescript
interface IMethodLog {
  id: string
  method: string  // 'find' | 'findOne' | 'insert' | etc.
  collection: string
  args: any  // Parsed from EJSON
  stack?: string
  timestamp: number
}

interface IMethodMessage {
  id: string
  collectionName: string
  method: string
  args: string  // EJSON stringified
  stack: string
  timestamp: number
}

interface IDocumentOrigin {
  type: 'server' | 'local' | 'unknown'
  ddpMessage?: DDPLog  // The 'added' message
  subscription?: IMeteorSubscription
  timestamp?: number
}

interface IDataFreshness {
  age: number | null  // milliseconds since last update
  isStale: boolean
  lastUpdate: number | null
  lastChangeMessage?: DDPLog
}

interface IQueryValidation {
  hasServerData: boolean
  serverDocCount: number
  orphanedDocs: IDocument[]
  coverage: number  // 0-1, percentage of results with server origin
}

interface ICorrelatedDocument extends IDocumentWrapper {
  origin: IDocumentOrigin
  freshness: IDataFreshness
}
```

---

### Step 2: Create Correlation Service (3-4 hours - MOST IMPORTANT)

**File:** Create `src/Stores/Panel/MinimongoStore/MinimongoDDPCorrelator.ts`

(Full implementation code as provided in the user's document - approximately 200 lines)

---

### Step 3-7: Remaining Implementation Steps

(Continue with integration into MinimongoStore, schema inference, method wrapping, message handlers, and UI components following the patterns established)

---

## ⚠️ PHASE 3: Common Pitfalls (Correlation-Specific)

### Pitfall 1: DDP Session vs Subscription ID Confusion

**Problem:** DDP messages have `session` field, subscriptions have `id` field. These are DIFFERENT.

**Solution:** Build mapping via `ready` messages.

### Pitfall 2: Orphaned Documents Are Normal

**Problem:** Not all documents have DDP origin (client-side inserts).

**Solution:** Distinguish `type: 'local'` vs `type: 'unknown'`.

### Pitfall 3: Correlation is Expensive

**Problem:** Cross-referencing thousands of DDP messages with documents is O(n²).

**Solution:**
- Use `@computed` - MobX memoizes results
- Build indexes (`Map` of `_id` → `DDPLog`)
- Limit correlation to visible documents only

### Pitfall 4: Stale Threshold is Arbitrary

**Problem:** What's "stale"? 1 second? 5 seconds?

**Solution:** Make it configurable, default to 5 seconds.

---

## 🧪 PHASE 4: Testing Strategy

### Correlation Integration Tests

**Test 1: Document Origin Tracking**
1. Open Meteor app
2. Wait for subscription to load (DDP `added` messages)
3. Select collection in Minimongo tab
4. **Verify:** Documents show "Server" badge with subscription name

**Test 2: Stale Data Detection**
1. Load collection
2. Manually trigger server update (via Meteor shell)
3. **Check:** Old query results show "Stale" badge

**Test 3: Orphaned Document Detection**
1. Insert document locally: `MyCollection.insert({name: 'Local'})`
2. **Check:** Shows "Local" badge (no DDP origin)

**Test 4: Correlation Insights**
1. View collection with mixed origins
2. **Check:** Insights card shows accurate counts

---

## 🏁 Success Criteria (Updated with Correlation)

When is the feature "done"?

1. ✅ User can see live query logs
2. ✅ Each log shows method, args (JSON tree), stack trace
3. ✅ Schema inference works
4. ✅ Documents show origin badges (server/local/unknown)
5. ✅ Documents show freshness status (fresh/stale with age)
6. ✅ Queries show validation badges (server data coverage)
7. ✅ Correlation insights card shows statistics
8. ✅ Can trace document back to subscription
9. ✅ Performance: No noticeable slowdown
10. ✅ Tests: Correlation logic has >80% coverage
11. ✅ Documentation: This guide updated with actual implementation

---

## 🚨 Before You Start Coding

**Checklist:**

- [ ] Have you read ALL prerequisite files?
- [ ] Do you understand DDPStore correlation patterns?
- [ ] Do you understand the session vs subscription ID problem?
- [ ] Have you planned how to test correlation?
- [ ] Do you understand this is the feature's UNIQUE VALUE?

**If you answered "no" to any of these, STOP. Correlation IS the feature.**

---

**Last Updated:** 2025-10-04 (added DDP correlation)
**Maintained By:** @primeinc
**Status:** Living Document
**Estimated Effort:** 10-14 hours (was 8-12 before correlation)
