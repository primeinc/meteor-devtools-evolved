# Feature Specification: Minimongo Query View with DDP Correlation

**Priority:** P1 (High - Unique Value Proposition)

**Estimated Effort:** 10-14 hours

**Status:** Planned

**Last Updated:** 2025-10-04

---

## Executive Summary

This feature transforms Meteor DevTools from a passive data viewer into an active **truth validator** that correlates client-side Minimongo activity with server-side DDP messages. This capability is unique in the Meteor ecosystem and provides 10x more debugging value than simple query logging.

**The Core Differentiator:** While Chrome DevTools can log Minimongo queries, only Meteor DevTools can validate whether that data represents server reality or stale local cache.

---

## The Problem

### Current State (Without This Feature)

Developers debugging Meteor apps face critical questions that existing tools cannot answer:

1. **Data Origin:** "Is this document from the server or locally inserted?"
2. **Data Freshness:** "Is this data stale (subscription stopped but doc still cached)?"
3. **Query Validation:** "Does this query's result match what the server sent?"
4. **Orphaned Data:** "Are there documents in cache from ended subscriptions?"
5. **Performance:** "Is this query unnecessary (data already from subscription)?"

**Current Debugging Workflow (Painful):**

```
Developer sees a bug → Checks Minimongo data → Looks correct
↓
Checks DDP messages → Finds subscription stopped 10 seconds ago
↓
Realizes data is stale → Spent 15 minutes debugging
↓
Could have been instant if tool correlated the two
```

### Why Chrome DevTools Can't Solve This

Chrome DevTools can log Minimongo method calls, but it:
- Doesn't track DDP protocol messages
- Can't correlate client state with server messages
- Can't detect stale or orphaned data
- Can't validate query results against server truth

**This is our opportunity to provide unique value.**

---

## The Solution: DDP Correlation

### What We're Building

A Minimongo inspection tool that:

1. **Intercepts Minimongo operations** (find, insert, update, remove)
2. **Correlates with DDP messages** (added, changed, removed, ready, nosub)
3. **Validates client state** against server reality
4. **Detects anomalies** (stale data, orphaned docs, unnecessary queries)
5. **Visualizes truth** in an intuitive UI

### Core Features

#### 1. Document Origin Tracking

For every document in Minimongo, show:

```typescript
{
  document: { _id: "abc", name: "John" },
  origin: {
    source: "server" | "local" | "unknown",
    subscription: "users.find",
    ddpMessage: { msg: "added", timestamp: 1234567890 },
    insertedAt: "2025-10-04 10:23:45"
  }
}
```

**User Value:** "Did the server send this or was it inserted locally?"

#### 2. Data Freshness Detection

For every document, show age and staleness:

```typescript
{
  document: { _id: "abc", name: "John" },
  freshness: {
    lastServerUpdate: 1234567890,
    age: 15000, // 15 seconds
    isStale: true, // >5s threshold
    reason: "Subscription 'users.find' stopped at 10:23:30"
  }
}
```

**User Value:** "Is this data current or from an old subscription?"

#### 3. Query Validation

For every Minimongo query, validate against server data:

```typescript
{
  query: { selector: { role: "admin" } },
  results: [{ _id: "abc", role: "admin" }],
  validation: {
    hasServerData: true,
    serverDocCount: 3,
    localDocCount: 1,
    orphanedDocs: [{ _id: "xyz", role: "admin" }], // No subscription
    coverage: 75% // 3/4 results from server
  }
}
```

**User Value:** "Does my query result match what the server sent?"

#### 4. Unnecessary Query Detection

Flag queries that are redundant:

```typescript
{
  query: { selector: { status: "active" } },
  analysis: {
    isUnnecessary: true,
    reason: "All results already available from subscription 'tasks.active'",
    subscriptionProviding: "tasks.active",
    performance: "Consider using subscription data directly"
  }
}
```

**User Value:** "Can I optimize by removing this query?"

#### 5. Live Schema Inference

Dynamically generate schema from documents:

```typescript
{
  collection: "users",
  schema: {
    _id: { type: "ObjectID", optional: false },
    name: { type: "string", optional: false },
    email: { type: "string", optional: true },
    roles: { type: "array", optional: true },
    createdAt: { type: "Date", optional: false }
  },
  confidence: "high" // All docs have same structure
}
```

**User Value:** "What fields exist and what are their types?"

---

## User Workflows

### Workflow 1: Debugging Stale Data

**Before (15+ minutes):**

1. User notices data doesn't update
2. Opens Minimongo panel, sees old data
3. Opens DDP panel, scrolls through 100+ messages
4. Finds "nosub" message from 10 seconds ago
5. Realizes subscription stopped, data is stale
6. Finally understands the bug

**After (<30 seconds):**

1. User notices data doesn't update
2. Opens Minimongo Query View
3. Sees document marked with ⚠️ **"STALE: 10s since subscription stopped"**
4. Immediately understands the bug
5. Fixes subscription logic

**Time Saved:** 14+ minutes

---

### Workflow 2: Finding Orphaned Documents

**Before (20+ minutes):**

1. Query returns unexpected results
2. Manually inspects each document in UI
3. Checks DDP logs to see which subscription sent it
4. Finds some docs have no active subscription
5. Realizes these are "orphaned" from old subscription
6. Spends time figuring out which subscription

**After (<1 minute):**

1. Query returns unexpected results
2. Opens Minimongo Query View
3. Sees validation: **"2 orphaned docs (no active subscription)"**
4. Clicks to expand, sees exactly which docs and why
5. Immediately fixes subscription management

**Time Saved:** 19+ minutes

---

### Workflow 3: Optimizing Performance

**Before (Manual analysis, often missed):**

1. App feels slow
2. Opens Chrome DevTools, sees many queries
3. Doesn't realize some queries are redundant
4. Subscription already provides the data
5. Performance issue persists

**After (Automatic detection):**

1. App feels slow
2. Opens Minimongo Query View
3. Sees ⚠️ **"Unnecessary query - data available from subscription 'users.all'"**
4. Refactors to use subscription data directly
5. Performance improves

**Performance Gain:** Potentially significant (eliminated unnecessary queries)

---

## Technical Architecture

### The Core Strategy: Interception + Correlation

The implementation has two main components:

#### 1. Method Interception (MinimongoInjector.ts)

```typescript
// Wrap Minimongo methods to capture operations
wrapMethod(collection, methodName, bridge) {
  const original = collection[methodName]
  const wrapped = function(...args) {
    // Capture operation details
    const log = {
      collection: collection._name,
      method: methodName,
      args: EJSON.stringify(args),
      stack: new Error().stack,
      timestamp: Date.now()
    }

    // Send to devtools
    sendMessage('MINIMONGO_METHOD', log)

    // Execute original method
    return original.apply(this, args)
  }

  collection[methodName] = wrapped
}
```

**Why This Works:**
- ✅ Captures exact queries and mutations
- ✅ Includes stack traces for debugging
- ✅ Non-invasive (doesn't break app)
- ✅ EJSON preserves Meteor types

#### 2. DDP Correlation (MinimongoDDPCorrelator.ts)

```typescript
// Correlate Minimongo docs with DDP messages
class MinimongoDDPCorrelator {
  constructor(
    private ddpStore: DDPStore,
    private minimongoStore: MinimongoStore
  ) {}

  /**
   * Find which subscription brought this document
   */
  @computed
  get documentOriginIndex(): Map<string, DDPLog> {
    const index = new Map()

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
    const addedLog = this.documentOriginIndex.get(key)

    if (!addedLog) {
      return { source: 'local', subscription: null }
    }

    const subId = this.sessionSubscriptionMap.get(addedLog.parsedContent.session)
    const subscription = this.ddpStore.subscriptions.get(subId)

    return {
      source: 'server',
      subscription,
      ddpMessage: addedLog,
      timestamp: addedLog.timestamp
    }
  }

  getDataFreshness(doc: IDocument, collection: string) {
    // Find latest 'changed' message for this doc
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
      isStale: age > 5000 // >5s threshold
    }
  }

  validateQuery(query: IMethodLog, results: IDocument[]) {
    const origins = results.map(doc =>
      this.findDocumentOrigin(doc, query.collection)
    )

    const serverDocs = origins.filter(o => o.source === 'server')
    const orphaned = results.filter((_, i) => origins[i].source !== 'server')

    return {
      hasServerData: serverDocs.length > 0,
      serverDocCount: serverDocs.length,
      orphanedDocs: orphaned,
      coverage: (serverDocs.length / results.length) * 100
    }
  }
}
```

**Why This Works:**
- ✅ Reuses 90% existing infrastructure (DDPStore)
- ✅ MobX @computed provides O(1) lookups via indexing
- ✅ Pattern proven in production (DDPInjector)
- ✅ Handles edge cases (session→subscription mapping via 'ready' messages)

### State Management

```typescript
// MinimongoStore.ts
export class MinimongoStore {
  @observable collections: Record<string, CollectionStore> = {}
  private correlator: MinimongoDDPCorrelator

  constructor(ddpStore: DDPStore) {
    this.correlator = new MinimongoDDPCorrelator(ddpStore, this)
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

// CollectionStore.ts
export class CollectionStore extends Searchable<IDocumentWrapper> {
  @observable methodLogs: IMethodLog[] = []
  private correlator: MinimongoDDPCorrelator

  @computed
  get queries() {
    return this.methodLogs.filter(log =>
      ['find', 'findOne'].includes(log.method)
    )
  }

  @computed
  get queriesWithValidation() {
    return this.queries.map(query => ({
      ...query,
      validation: this.correlator.validateQuery(query, query.results),
      isUnnecessary: this.correlator.detectUnnecessaryQuery(query).isUnnecessary
    }))
  }

  @computed
  get documentsWithOrigin() {
    return this.collection.map(wrapper => ({
      ...wrapper,
      origin: this.correlator.findDocumentOrigin(wrapper.document, wrapper.collectionName),
      freshness: this.correlator.getDataFreshness(wrapper.document, wrapper.collectionName)
    }))
  }

  @computed
  get schema() {
    const docs = this.collection.map(w => w.document)
    return inferSchema(docs)
  }
}
```

### Session to Subscription Mapping (Critical)

DDP messages use `session` IDs, but subscriptions use `id` (subId). The correlation depends on mapping these correctly:

```typescript
// The Challenge:
// 'added' message has session, but subscription has different ID

{
  msg: 'added',
  session: 'abc123',  // <-- This
  collection: 'users',
  id: 'user456'
}

{
  msg: 'sub',
  id: 'sub789',  // <-- NOT the same as session!
  name: 'users.find'
}

// The Solution: Use 'ready' messages to map session → subId

{
  msg: 'ready',
  session: 'abc123',
  subs: ['sub789']  // <-- The mapping!
}

// Implementation:
@computed
get sessionSubscriptionMap(): Map<string, string> {
  const map = new Map()

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
```

**Critical Pitfall to Avoid:**

```typescript
// ❌ WRONG - subscription.id is NOT the session
const subId = addedLog.parsedContent.session

// ✅ RIGHT - use ready message to map session → subId
const subId = this.sessionSubscriptionMap.get(addedLog.parsedContent.session)
```

---

## UI Design

### Tab Layout

```
┌─────────────────────────────────────────────────┐
│ Collections: Users ▼                            │
├─────────────────────────────────────────────────┤
│ [Documents] [Queries] [Schema]                  │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────┐       │
│  │ Query: find({ role: "admin" })      │       │
│  │ Results: 4 documents                │       │
│  │ ✅ Valid: 75% from server           │       │
│  │ ⚠️  1 orphaned document detected    │       │
│  │                                     │       │
│  │ [Show Stack Trace ▼]                │       │
│  │ [Show Validation Details ▼]         │       │
│  └─────────────────────────────────────┘       │
│                                                 │
│  ┌─────────────────────────────────────┐       │
│  │ Document: { _id: "abc", ... }       │       │
│  │ 📡 From subscription: "users.admin" │       │
│  │ 🕐 Updated: 2s ago                  │       │
│  │ ✅ Fresh                             │       │
│  └─────────────────────────────────────┘       │
│                                                 │
│  ┌─────────────────────────────────────┐       │
│  │ Document: { _id: "xyz", ... }       │       │
│  │ 💻 Local insert (not from server)   │       │
│  │ 🕐 Inserted: 5s ago                 │       │
│  │ ⚠️  No active subscription          │       │
│  └─────────────────────────────────────┘       │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Visual Indicators

- ✅ **Green:** Data from active subscription, fresh
- ⚠️ **Yellow:** Data stale or orphaned
- ❌ **Red:** Query validation failed, critical issue
- 📡 **Server icon:** Document from server
- 💻 **Local icon:** Document locally inserted
- 🕐 **Clock icon:** Timestamp/age indicator

---

## Implementation Plan

### Phase 0: Read Existing Patterns (1 hour)

**Objective:** Understand proven correlation patterns

**Tasks:**
1. Read `DDPStore.ts` - Understand correlation infrastructure
2. Read `DDPInjector.ts` - Understand wrapping pattern
3. Document key patterns to copy

**Output:** Pattern mapping document (DDPStore → Minimongo)

---

### Phase 1: Document Origin Tracking (2-3 hours)

**Objective:** Correlate documents with DDP 'added' messages

**Tasks:**
1. Create `MinimongoDDPCorrelator.ts`
2. Implement `documentOriginIndex` (@computed Map)
3. Implement `findDocumentOrigin(doc, collection)`
4. Implement `sessionSubscriptionMap` (@computed Map)
5. Test with DDPStore in dev environment

**Output:** Documents show which subscription sent them

---

### Phase 2: Data Freshness Detection (1-2 hours)

**Objective:** Detect stale data

**Tasks:**
1. Implement `documentFreshnessIndex` (@computed Map)
2. Implement `getDataFreshness(doc, collection)`
3. Add 5-second staleness threshold
4. Add UI indicator for stale data

**Output:** Documents show age and staleness

---

### Phase 3: Query Validation (2-3 hours)

**Objective:** Validate query results against server

**Tasks:**
1. Implement `validateQuery(query, results)`
2. Detect orphaned documents
3. Calculate server coverage percentage
4. Add UI for validation results

**Output:** Queries show validation status

---

### Phase 4: Unnecessary Query Detection (2-3 hours)

**Objective:** Flag redundant queries

**Tasks:**
1. Implement `detectUnnecessaryQuery(query)`
2. Check if subscription already provides data
3. Add UI warning for unnecessary queries
4. Add performance recommendations

**Output:** Queries flagged if redundant

---

### Phase 5: Testing & Polish (2 hours)

**Objective:** Ensure production quality

**Tasks:**
1. Unit tests for correlator methods
2. Integration tests with DDPStore
3. Manual QA in sample Meteor app
4. Performance testing (1000+ documents)
5. Documentation updates

**Output:** Production-ready feature

---

## Success Metrics

### Quantitative

1. **Time Saved:** 15+ minutes per debugging session → <1 minute
2. **Bug Detection:** Catch 100% of stale data issues (currently 0%)
3. **Performance:** O(1) correlation lookups (vs O(n) naive)
4. **Accuracy:** 100% DDP correlation accuracy

### Qualitative

1. **User Feedback:** "Finally, a tool that validates truth!"
2. **Positioning:** "The only Meteor devtools that correlates client/server"
3. **Differentiation:** Cannot be replicated by Chrome DevTools

---

## Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Session→Subscription mapping fails | Low | High | Copy proven DDPStore pattern, extensive testing |
| Performance with 1000+ docs | Medium | Medium | Use MobX @computed indexing (O(1) lookups) |
| Edge cases in DDP protocol | Low | Medium | DDPStore already handles these, reuse logic |

### Product Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Users don't understand correlation | Low | High | Clear UI indicators, tooltips, documentation |
| Too complex for MVP | Low | Medium | Can ship Phase 1-2 only (origin + freshness) |

---

## ROI Analysis

**Investment:** 10-14 hours development

**Return:**

1. **Time Savings:**
   - Average debugging session: 15 minutes → 30 seconds
   - Per developer: ~5 sessions/week = 72 minutes saved/week
   - Team of 10: 12 hours saved/week
   - **Payback:** <1 week for a single team

2. **Bug Prevention:**
   - Catch stale data bugs before production
   - Detect orphaned documents automatically
   - Identify unnecessary queries for optimization
   - **Value:** Potentially prevents critical bugs

3. **Competitive Differentiation:**
   - Unique feature in Meteor ecosystem
   - Cannot be replicated without DDP access
   - Positions tool as "truth validator" not "data viewer"
   - **Value:** Market leadership

**Conclusion:** +4 hours (correlation vs simple logging) = 10x more value

---

## Competitive Analysis

### Chrome DevTools (Competitor)

**What it can do:**
- ✅ Log Minimongo method calls
- ✅ Show query selectors
- ✅ Capture stack traces

**What it CANNOT do:**
- ❌ Correlate with DDP protocol
- ❌ Validate against server data
- ❌ Detect stale data
- ❌ Find orphaned documents
- ❌ Identify unnecessary queries

**Our Advantage:** We have DDP access, they don't.

### Minimongo Devtools (Older Extension)

**What it can do:**
- ✅ Show Minimongo data
- ✅ Basic query logging

**What it CANNOT do:**
- ❌ DDP correlation (same limitations as Chrome DevTools)
- ❌ Active development (abandoned project)

**Our Advantage:** Active development + unique correlation feature.

---

## Future Enhancements (Post-MVP)

### Phase 6: Advanced Query Analysis (Future)

- Query performance metrics (execution time)
- Query optimization suggestions
- Duplicate query detection
- Index recommendations

### Phase 7: Real-time Alerts (Future)

- Alert when data goes stale
- Alert on orphaned documents
- Alert on unnecessary queries
- Configurable thresholds

### Phase 8: Export & Reporting (Future)

- Export query logs to JSON
- Generate performance reports
- Share debugging sessions
- Replay query sequences

---

## Decision Points

### Must Decide Before Implementation

1. **ADR-001:** Collections data structure (Recommend: Option B - Unified CollectionStore)
2. **ADR-008:** DDP Correlation strategy (Recommend: Option B - Full Correlation)

### Already Decided

- ✅ Circular buffer (1000 logs per collection)
- ✅ Throttling (100ms, max 10 messages/second)
- ✅ EJSON serialization (preserve Meteor types)
- ✅ Full stack capture, truncate in UI
- ✅ Tabs layout (Documents | Queries | Schema)
- ✅ Session→Subscription mapping via 'ready' messages
- ✅ MobX @computed indexing for O(1) performance

---

## Summary

**What We're Building:**

A Minimongo inspection tool that correlates client-side queries with server-side DDP messages to validate data truth, detect stale data, find orphaned documents, and identify unnecessary queries.

**Why It Matters:**

This is the ONLY tool that can answer: "Is this Minimongo data actually what the server sent, or is it stale/orphaned/local?"

**How It Works:**

1. Intercept Minimongo methods (find, insert, update, remove)
2. Correlate with DDPStore messages (added, changed, removed, ready)
3. Validate client state against server reality
4. Visualize truth with clear UI indicators

**Effort:** 10-14 hours

**Value:** 10x debugging efficiency + unique market positioning

**Pattern:** Copy proven DDPStore/DDPInjector patterns (90% infrastructure exists)

**Risk:** Low (reusing battle-tested patterns)

**Recommendation:** Implement full correlation (Option B). The +4 hours over simple logging delivers 10x more value.

---

**Approved By:** [Pending]

**Implementation Start:** [TBD]

**Target Completion:** [TBD]

---

**Last Updated:** 2025-10-04
**Document Version:** 2.0 (with DDP Correlation)
