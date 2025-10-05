# Architecture Gotchas & Solutions

**Purpose:** Critical architectural considerations that affect multiple workloads.
**Audience:** All devs working on Workloads B, D, E

---

## Gotcha 1: State Persistence on HMR/Page Refresh 🔴 CRITICAL

### The Problem

A common frustration with developer tools is losing all context the moment HMR kicks in or the page is manually refreshed.

**User Impact:**
- Developer spends 5 minutes reproducing a bug
- Sees DDP messages and reactivity chains build up in devtool
- Saves a file (HMR) → **ALL DATA LOST**
- Breaks debugging flow, significant DX issue

### Why This Happens

Currently, all state lives in DevTools Panel's MobX stores:
- `DDPStore`
- `TrackerStore`
- `MinimongoStore`
- `PerformanceStore`

**Problem:** DevTools panel is destroyed when:
- Page refreshes
- HMR triggers
- User closes/reopens DevTools

→ All stores are recreated from scratch with empty data.

---

### ✅ Solution: Background Script as Primary Data Owner

**Architecture Change:**

```
BEFORE (Current):
Page → Inject.ts → Content.ts → Background.ts → Panel MobX stores (volatile)
                                                  ↓
                                              Data lost on refresh

AFTER (Recommended):
Page → Inject.ts → Content.ts → Background.ts (PRIMARY DATA OWNER)
                                      ↓
                                  Panel MobX stores (VIEW of background data)
                                      ↓
                                  Survives refresh!
```

**Why Background Script?**
- Background script persists for the **life of the tab**
- Not destroyed on page refresh
- Not destroyed on HMR
- Not destroyed when DevTools panel closes

---

### Implementation Strategy

#### Phase 1: Background Script as Data Store

```typescript
// src/Browser/Background.ts
class BackgroundDataStore {
  // Store data here instead of Panel stores
  ddpLogs: DDPLog[] = []
  computations: Map<string, IComputation> = new Map()
  minimongoLogs: MinimongoMethodLog[] = []
  longTasks: LongTask[] = []

  // When message arrives from content script
  handleMessage(message: Message) {
    switch (message.eventType) {
      case 'ddp-event':
        this.ddpLogs.push(message.data)
        // Broadcast to all connected panels
        this.broadcastToDevTools({ type: 'ddp-log-added', data: message.data })
        break

      case 'tracker-computation-created':
        this.computations.set(message.data.computationId, message.data)
        this.broadcastToDevTools({ type: 'computation-created', data: message.data })
        break

      // ... other events
    }
  }

  // When DevTools panel opens, send all existing data
  initializePanel(port: chrome.runtime.Port) {
    port.postMessage({
      type: 'initial-state',
      data: {
        ddpLogs: this.ddpLogs,
        computations: Array.from(this.computations.values()),
        minimongoLogs: this.minimongoLogs,
        longTasks: this.longTasks
      }
    })
  }
}
```

#### Phase 2: Panel Stores as Views

```typescript
// src/Stores/Panel/DDPStore.ts
export class DDPStore extends EventEmitter {
  @observable collection: DDPLog[] = []

  constructor() {
    super()
    makeObservable(this)

    // Listen for initial state from background script
    bridge.on('initial-state', (state) => {
      this.collection = state.ddpLogs
    })

    // Listen for incremental updates
    bridge.on('ddp-log-added', (log) => {
      this.collection.push(log)
    })
  }
}
```

#### Phase 3: "Preserve Log on Navigation" Feature

```typescript
// src/Pages/Panel/Settings/index.tsx
export const SettingsPanel = observer(() => {
  return (
    <Checkbox
      checked={PanelStore.settingStore.preserveLogOnNavigation}
      onChange={(e) => PanelStore.settingStore.setPreserveLog(e.target.checked)}
      label="Preserve log on navigation"
    />
  )
})
```

```typescript
// src/Browser/Background.ts
class BackgroundDataStore {
  clearOnNavigation = true  // Default behavior

  handleNavigationEvent() {
    if (!this.clearOnNavigation) {
      // Keep data across page loads
      return
    }

    // Clear data (old behavior)
    this.ddpLogs = []
    this.computations.clear()
    // ...
  }
}
```

---

### Benefits

1. ✅ **Data survives HMR** - Developer doesn't lose context
2. ✅ **Data survives page refresh** - Can debug across navigations
3. ✅ **Chrome DevTools Network tab pattern** - Familiar UX (Preserve Log checkbox)
4. ✅ **Massive QOL improvement** - Debugging flow not broken

---

### Affected Workloads

- ✅ **Workload B** (DDPStore)
- ✅ **Workload C** (TrackerStore)
- ✅ **Workload D** (PerformanceStore)
- ⚠️ **All stores** should use this pattern

**Implementation Timing:** Can be added AFTER initial workloads complete (refactoring phase).

**Alternative:** Start with this architecture from the beginning in Workload B (DDPStore refactor).

---

## Gotcha 2: Merge Box Field Ambiguity 🟡 MEDIUM

### The Problem

If two active subscriptions publish the **same document** (`_id`) but with **different fields** (due to different `fields` projectors), Minimongo doesn't keep two versions. It **merges** them.

**This causes incredibly confusing bugs:**

1. **Unexpected field appears:**
   - User subscribes to `posts.list` (gets `{ title, author }`)
   - Later subscribes to `posts.details` (gets `{ title, content, comments }`)
   - **Merge result:** Document now has `{ title, author, content, comments }`
   - Developer confused: "Where did `comments` come from?"

2. **Unexpected field disappears:**
   - User stops `posts.details` subscription
   - Document reverts to `{ title, author }`
   - **Bug:** UI component that was reading `content` now breaks
   - Developer confused: "Why did `content` disappear? We didn't change anything!"

### Why This Happens

**Meteor's Client-Side Merge Box:**
- When multiple subscriptions publish the same doc, Minimongo **unions** the fields
- When a subscription stops, Minimongo **removes only the fields unique to that subscription**
- **Problem:** It's not obvious which subscription is providing which field

---

### ✅ Solution: Merge Box Field Tracking in Auditor

**Enhancement to Workload E (Auditor):**

```typescript
// src/Services/Auditor.ts (extend)
export class Auditor {
  /**
   * Enhanced: Track WHICH FIELDS each subscription provides
   */
  @computed
  get overlappingSubscriptionsWithFields() {
    const issues = []
    const docToSubFields = new Map<string, Map<string, string[]>>()  // doc → sub → fields

    const activeSubs = PanelStore.subscriptionStore.subsWithMeta

    for (const sub of activeSubs) {
      // Find all 'added' messages for this subscription
      const addedDocs = PanelStore.ddpStore.collection.filter(log =>
        log.parsedContent.msg === 'added' &&
        log.timestamp >= sub.startTime &&
        log.timestamp <= sub.readyTime
      )

      for (const doc of addedDocs) {
        const key = `${doc.parsedContent.collection}:${doc.parsedContent.id}`
        if (!docToSubFields.has(key)) {
          docToSubFields.set(key, new Map())
        }

        // Track FIELDS provided by this subscription
        const fields = Object.keys(doc.parsedContent.fields || {})
        docToSubFields.get(key)!.set(sub.name, fields)
      }
    }

    // Find documents with overlapping subscriptions
    for (const [docKey, subFields] of docToSubFields.entries()) {
      if (subFields.size > 1) {
        const [collection, docId] = docKey.split(':')

        // Compare field sets
        const allSubs = Array.from(subFields.entries())
        const fieldComparison = allSubs.map(([subName, fields]) =>
          `  - ${subName}: { ${fields.join(', ')} }`
        ).join('\n')

        // Check if field sets are identical
        const firstFields = new Set(allSubs[0][1])
        const identical = allSubs.every(([_, fields]) =>
          fields.length === firstFields.size &&
          fields.every(f => firstFields.has(f))
        )

        issues.push({
          type: 'MERGE_BOX_OVERLAP',
          document: docKey,
          subscriptions: Array.from(subFields.keys()),
          fieldSetsIdentical: identical,
          message: `Document ${collection}:${docId} is published by ${subFields.size} subscriptions with ${identical ? 'IDENTICAL' : 'DIFFERENT'} field sets:\n${fieldComparison}`,
          recommendation: identical
            ? 'Field sets are identical, safe to merge. Consider consolidating publications to reduce overhead.'
            : '⚠️ Field sets differ! This can cause unpredictable reactivity. Ensure both publications provide the same fields, or consolidate them.',
          severity: identical ? 'LOW' : 'HIGH'
        })
      }
    }

    return issues
  }
}
```

---

### UI Enhancement

```typescript
// src/Pages/Panel/Auditor/index.tsx
export const AuditorPanel = observer(() => {
  const { overlappingSubscriptionsWithFields } = auditor

  return (
    <section>
      <h3>Merge Box Conflicts ({overlappingSubscriptionsWithFields.length})</h3>
      {overlappingSubscriptionsWithFields.map((issue, i) => (
        <Card key={i}>
          <Tag intent={issue.severity === 'HIGH' ? 'danger' : 'success'}>
            {issue.fieldSetsIdentical ? 'SAFE' : 'CONFLICT'}
          </Tag>
          <pre>{issue.message}</pre>
          <p><em>Recommendation:</em> {issue.recommendation}</p>
        </Card>
      ))}
    </section>
  )
})
```

---

### Example Output

```
⚠️ Document posts:abc123 is published by 2 subscriptions with DIFFERENT field sets:
  - posts.list: { _id, title, author }
  - posts.details: { _id, title, content, comments }

Recommendation: ⚠️ Field sets differ! This can cause unpredictable reactivity.
Ensure both publications provide the same fields, or consolidate them.
```

---

### Benefits

1. ✅ **Makes merge box behavior visible** - Developer sees which fields come from which subscription
2. ✅ **Flags dangerous overlaps** - Different field sets = HIGH severity
3. ✅ **Safe overlaps = LOW severity** - Identical field sets are fine (just redundant)
4. ✅ **Actionable recommendations** - Tells developer exactly what to fix

---

### Affected Workloads

- ✅ **Workload E** (Auditor) - Implements detection logic
- ✅ **Workload B** (DDPStore) - Must track `fields` in `added` messages

**Implementation Timing:** Part of Workload E (Task 1 enhancement).

---

## Summary

| Gotcha | Severity | Affected Workloads | Implementation Timing |
|--------|----------|-------------------|----------------------|
| **State Persistence on HMR** | 🔴 CRITICAL | B, C, D (all stores) | After Workload B complete (refactor) OR build-in from start |
| **Merge Box Field Ambiguity** | 🟡 MEDIUM | E (Auditor), B (DDPStore) | During Workload E (Task 1) |

---

## Recommendations

1. **State Persistence:** Implement ASAP after Workload B (DDPStore) is complete. Refactor Background.ts to be primary data owner.

2. **Merge Box Tracking:** Implement as part of Workload E (Auditor). Requires tracking `fields` array in `added` messages (small change to Workload B).

3. **Testing:** Both features should be tested with `/devapp`:
   - State persistence: Trigger HMR, verify data survives
   - Merge box: Create two subscriptions with overlapping docs but different fields, verify detection

---

**Document Status:** Architecture guidance for all workloads
**Date:** 2025-10-05
**Priority:** State Persistence = P0, Merge Box = P1
