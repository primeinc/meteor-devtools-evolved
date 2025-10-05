# Four-Source Data Truth Model

**Status:** Architectural Concept
**Type:** Mental Model
**Implementation Status:** Partial (3/4 sources tracked, no correlation)

---

## Purpose

Defines a comprehensive mental model for understanding data flow in Meteor applications by tracking data through four distinct layers from server to user's screen.

**Audience:** Architects, feature designers, anyone reasoning about Meteor data flow

---

## The Four Sources

Meteor data flows through four distinct layers, each representing a "source of truth" at different stages:

```
┌─────────────────────────────────────────────────────┐
│  1. DDP MESSAGES        │  2. MINIMONGO CACHE       │
│  "What server sent"     │  "What client stored"     │
│  DDPStore               │  MinimongoStore           │
└─────────────────────────┴───────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│  3. SUBSCRIPTION STATE  │  4. RENDERED DOM          │
│  "What we're watching"  │  "What user sees"         │
│  SubscriptionStore      │  (NOT IMPLEMENTED)        │
└─────────────────────────┴───────────────────────────┘
```

### Source 1: DDP Messages

**What it represents:** Raw server communication

**Tracked by:** `DDPStore` (src/Stores/Panel/DDPStore.ts)
**Injected by:** `DDPInjector` (src/Injectors/DDPInjector.ts)

**What we capture:**
- All inbound/outbound DDP messages
- Message timestamps
- Message content (added, changed, removed, sub, ready, etc.)
- Bandwidth usage

**Example data:**
```json
{
  "msg": "added",
  "collection": "users",
  "id": "abc123",
  "fields": { "name": "John", "age": 30 }
}
```

### Source 2: Minimongo Cache

**What it represents:** Client-side reactive data store

**Tracked by:** `MinimongoStore` (src/Stores/Panel/MinimongoStore/)
**Injected by:** `MinimongoInjector` (src/Injectors/MinimongoInjector.ts)

**What we capture:**
- All documents in all collections
- Collection metadata (size, document count)
- EJSON-serialized data (preserves Dates, ObjectIds)

**Example data:**
```javascript
{
  _id: "abc123",
  name: "John",
  age: 30,
  createdAt: { $date: 1633024800000 }  // EJSON Date
}
```

### Source 3: Subscription State

**What it represents:** Active data subscriptions

**Tracked by:** `SubscriptionStore` (src/Stores/Panel/SubscriptionStore.ts)

**What we capture:**
- Active subscriptions with arguments
- Subscription lifecycle (init → ready timing via DDPStore correlation)
- Subscription metadata

**Example data:**
```javascript
{
  id: "sub123",
  name: "users.byId",
  params: ["abc123"],
  ready: true,
  duration: "142ms"  // Computed from DDP messages
}
```

**Current correlation:** DDPStore correlates subscription `sub` messages with `ready` messages to compute duration (see `DDPStore.getSubscriptionMeta`).

### Source 4: Rendered DOM

**What it represents:** Actual user experience

**Status:** ❌ NOT IMPLEMENTED (speculative)

**What it WOULD capture:**
- Which DOM elements contain which Minimongo data
- Shadow DOM traversal
- Data binding confidence scores
- Stale/missing renders

**Why it matters:** The only source that validates what users actually see.

---

## Why Four Sources Matter

### The Gap Problem

Data can be present in one source but missing in another, revealing bugs:

**Example 1: Ghost Document**
- ✅ DDP: Server sent `added` message
- ✅ Minimongo: Document stored
- ✅ Subscription: Active
- ❌ DOM: User doesn't see it

**Diagnosis:** Template logic bug (conditional excluded data, or reactive helper has error)

**Example 2: Zombie Document**
- ❌ DDP: Server sent `removed` message
- ❌ Minimongo: Document deleted
- ❌ Subscription: Inactive
- ✅ DOM: Still showing old data

**Diagnosis:** Stale closure, or component didn't re-render

**Example 3: Orphaned Data**
- ❌ DDP: Never sent
- ❌ Minimongo: Not present
- ❌ Subscription: Inactive
- ✅ DOM: Rendering something

**Diagnosis:** Hardcoded value, localStorage, or non-Meteor data source

### Current Limitations

**What we CAN'T detect today:**
- Whether Minimongo documents are backed by active subscriptions
- Whether DDP `added` messages actually updated Minimongo
- Whether Minimongo data is actually rendered
- Template/helper bugs that prevent rendering

**Why:** No correlation logic exists between the three implemented sources.

---

## Implementation Status

### What EXISTS (Implementation in Production)

```typescript
// src/Stores/PanelStore.tsx
export class PanelStoreConstructor {
  ddpStore = new DDPStore()           // ✅ Source 1
  minimongoStore = new MinimongoStore() // ✅ Source 2
  subscriptionStore = new SubscriptionStore() // ✅ Source 3
  // ... but NO correlation between them
}
```

**Infrastructure:** ✅ All three stores exist and collect data independently

**Correlation:** ❌ Only DDP ↔ Subscription correlation exists (for duration measurement)

### What DOESN'T EXIST

1. **Minimongo ↔ Subscription Correlation**
   - Can't answer: "Which subscription owns this document?"
   - Can't detect: Orphaned documents (in Minimongo but no active sub)

2. **DDP ↔ Minimongo Correlation**
   - Can't answer: "Did this `added` message reach Minimongo?"
   - Can't detect: Message delivery failures

3. **DOM Tracking** (Source 4)
   - Not implemented
   - See `docs/research/dom-data-correlation.md` for challenges

---

## Mental Model Benefits

Even without full implementation, this four-source model is valuable for:

1. **Reasoning About Bugs**
   - "Is this a server issue (DDP), cache issue (Minimongo), subscription issue, or rendering issue (DOM)?"

2. **Feature Design**
   - Forces comprehensive thinking about data flow

3. **Debugging Strategy**
   - Check each source in sequence to isolate failures

4. **Documentation**
   - Provides common vocabulary ("Source 2 has the data but Source 4 doesn't")

---

## Implementation Status by Feature

### ✅ Three-Source Correlation (DESIGNED - Ready to Implement)

**Feature:** Minimongo Query View (see `docs/features/minimongo-query-view/`)

**What it includes:**
- Correlate Minimongo documents with DDP messages
- Trace documents to originating subscriptions
- Validate query results against server data
- Detect orphaned/stale documents
- Measure data freshness

**Status:**
- Design complete with detailed implementation guide
- Estimated: 10-14 hours total (includes 3-4 hours correlation logic)
- Infrastructure: ~40% complete (stores exist, correlation service needed)

**When implemented, this will provide Sources 1-3 correlation.**

### Medium-term (Requires Research)

**Framework Instrumentation:**
- Hook into Blaze rendering to track data contexts
- Definitive DOM → Minimongo correlation
- Detect template/helper bugs

**Implementation estimate:** 40-80 hours (requires framework internals knowledge)

### Long-term (Requires Prototyping)

**Visual Data Painting:**
- Highlight data on page with health indicators
- Interactive DOM overlays
- Real-time freshness heatmaps

**Implementation estimate:** Unknown (depends on instrumentation feasibility)

---

## Related Documents

**Implementation:**
- `docs/features/minimongo-query-view/` - **Implements Sources 1-3 correlation** (ready to build)
- `src/Stores/Panel/DDPStore.ts:76-93` - Existing DDP ↔ Subscription correlation example

**Research:**
- `docs/research/dom-data-correlation.md` - Source 4 challenges (unproven, needs prototyping)

**Specifications:**
- `docs/DRAFT_PROPOSAL_MongoDB_Data_Serialization_Specification.md` - EJSON handling in Source 2

---

## Decision: Document as Concept, Not Feature

**Why this is in `docs/architecture/` not `docs/features/`:**

1. **Mental model** - Useful for reasoning even if never fully implemented
2. **Partial implementation** - Infrastructure exists but correlation doesn't
3. **Speculative components** - DOM tracking is unproven
4. **Educational value** - Helps understand Meteor data flow

**If/when to promote to feature:**
- Three-source correlation is implemented with working examples
- DOM correlation is prototyped and proven feasible
- Implementation guide can be written with concrete steps

---

**Last Updated:** 2025-10-05
**Maintainer:** Development Team
**Status:** Living Document (Conceptual)
