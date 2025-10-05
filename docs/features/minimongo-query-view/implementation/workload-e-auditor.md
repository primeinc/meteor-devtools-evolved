# Workload E: Intelligent Auditor

**Owner:** Dev E
**Effort:** 8-10 hours (Iteration 6)
**Dependencies:** ALL previous workloads (integrates everything)
**Outputs:** AuditorStore, anti-pattern detection, opt-in Proxy field tracking, overlapping subscription detection

---

## Overview

Evolves the devtool from passive viewer to intelligent assistant. Automatically analyzes collected data, identifies anti-patterns, provides actionable recommendations.

**Why last?** Reads from all stores created in Workloads A-D.

---

## Task 1: Heuristic Analysis (3h)

**Goal:** Detect over-fetching, missing indexes, large payloads.

```typescript
// src/Services/Auditor.ts
import { computed } from 'mobx'
import { PanelStore } from '../Stores/PanelStore'

export class Auditor {
  /**
   * Detect over-fetching: Subscription returns many docs but only few queried
   */
  @computed
  get overFetchingIssues() {
    const issues = []
    const subscriptions = PanelStore.subscriptionStore.subsWithMeta

    for (const sub of subscriptions) {
      if (!sub.initialDataLoadBytes) continue

      const docsLoaded = Math.round(sub.initialDataLoadBytes / 1024)  // Estimate: 1KB per doc

      const docsQueried = PanelStore.minimongoStore.findLogs.filter(log =>
        log.timestamp > sub.readyTime &&
        log.timestamp < sub.readyTime + 10000  // 10s window
      ).length

      if (docsLoaded > 100 && docsQueried < 10) {
        issues.push({
          type: 'OVER_FETCHING',
          subscription: sub.name,
          docsLoaded,
          docsQueried,
          message: `Subscription "${sub.name}" loaded ~${docsLoaded} documents but only ${docsQueried} were queried`,
          recommendation: 'Add filters to publication to reduce data sent',
          severity: 'HIGH'
        })
      }
    }

    return issues
  }

  /**
   * Detect missing indexes: Query takes >50ms
   */
  @computed
  get missingIndexIssues() {
    const issues = []
    const slowQueries = PanelStore.minimongoStore.findLogs.filter(log => log.runtime > 50)

    for (const query of slowQueries) {
      issues.push({
        type: 'MISSING_INDEX',
        collection: query.collectionName,
        selector: query.selector,
        runtime: query.runtime,
        message: `Query on "${query.collectionName}" took ${query.runtime}ms`,
        recommendation: 'Add index on queried fields or reduce collection size',
        severity: query.runtime > 100 ? 'HIGH' : 'MEDIUM'
      })
    }

    return issues
  }

  /**
   * Detect large payloads
   */
  @computed
  get largePayloadIssues() {
    const issues = []
    const largeDDP = PanelStore.ddpStore.collection.filter(log =>
      log.byteSize && log.byteSize > 100000  // >100KB
    )

    for (const log of largeDDP) {
      issues.push({
        type: 'LARGE_PAYLOAD',
        message: log.parsedContent.msg,
        byteSize: log.byteSize,
        recommendation: 'Use projection to limit fields sent',
        severity: log.byteSize > 500000 ? 'HIGH' : 'MEDIUM'
      })
    }

    return issues
  }

  /**
   * NEW: Detect overlapping subscriptions (GOTCHA from user)
   * Multiple subscriptions publishing the same document
   */
  @computed
  get overlappingSubscriptions() {
    const issues = []
    const docToSubs = new Map<string, string[]>()

    // Track which subscriptions provide which documents
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
        if (!docToSubs.has(key)) {
          docToSubs.set(key, [])
        }
        docToSubs.get(key)!.push(sub.name)
      }
    }

    // Find documents published by multiple subscriptions
    for (const [docKey, subs] of docToSubs.entries()) {
      if (subs.length > 1) {
        const [collection, docId] = docKey.split(':')

        issues.push({
          type: 'OVERLAPPING_SUBSCRIPTIONS',
          document: docKey,
          subscriptions: subs,
          message: `Document ${collection}:${docId} is published by ${subs.length} subscriptions: ${subs.join(', ')}`,
          recommendation: 'Consider consolidating these publications or ensuring their field sets are identical to avoid merge-box confusion',
          severity: 'MEDIUM'
        })
      }
    }

    return issues
  }
}

export const auditor = new Auditor()
```

**Files Created:** `src/Services/Auditor.ts`

---

## Task 2: Anti-Pattern Detection (2h)

**Goal:** Detect N+1 queries.

```typescript
// src/Services/Auditor.ts (extend)
export class Auditor {
  /**
   * Detect N+1 queries: Same query run multiple times in quick succession
   */
  @computed
  get nPlusOneIssues() {
    const issues = []
    const queryGroups = this.groupQueriesBySelector()

    for (const [selector, queries] of Object.entries(queryGroups)) {
      if (queries.length > 5) {
        const timeSpan = queries[queries.length - 1].timestamp - queries[0].timestamp

        if (timeSpan < 1000) {  // All within 1 second
          issues.push({
            type: 'N_PLUS_ONE',
            selector,
            count: queries.length,
            message: `Query "${selector}" executed ${queries.length} times in ${timeSpan}ms`,
            recommendation: 'Use $in operator or denormalize data',
            severity: 'HIGH'
          })
        }
      }
    }

    return issues
  }

  private groupQueriesBySelector(): Record<string, any[]> {
    const groups: Record<string, any[]> = {}

    PanelStore.minimongoStore.findLogs.forEach(log => {
      const key = JSON.stringify(log.selector)
      if (!groups[key]) groups[key] = []
      groups[key].push(log)
    })

    return groups
  }
}
```

---

## Task 3: Opt-In Proxy Field Tracking (3h)

**Goal:** Track which fields are actually accessed (opt-in due to performance impact).

```typescript
// src/Stores/Panel/SettingStore.ts
export class SettingStore {
  @observable isDeepFieldAnalysisEnabled = false

  @action
  setDeepFieldAnalysis(enabled: boolean) {
    this.isDeepFieldAnalysisEnabled = enabled
  }
}
```

**Settings UI:**

```typescript
// src/Pages/Panel/Settings/index.tsx
export const SettingsPanel = observer(() => {
  return (
    <div>
      {/* Existing settings... */}

      <Callout intent="warning">
        <h3>Advanced: Deep Field Analysis</h3>
        <Checkbox
          checked={PanelStore.settingStore.isDeepFieldAnalysisEnabled}
          onChange={(e) => PanelStore.settingStore.setDeepFieldAnalysis(e.target.checked)}
          label="Enable field access tracking (performance impact)"
        />
        <p>
          Wraps documents in Proxy to detect which fields are accessed.
          May slow down app. Use only when debugging phantom re-runs.
        </p>
      </Callout>
    </div>
  )
})
```

**Conditional Proxy Wrapping (in MeteorAdapter.ts):**

```typescript
// src/Injectors/MeteorAdapter.ts (extend existing wrapping)
prototype['find'] = function (...args) {
  const result = original.apply(this, args)

  // Only wrap if feature enabled
  if (!PanelStore?.settingStore?.isDeepFieldAnalysisEnabled) {
    return result
  }

  // Wrap cursor to track field access
  const wrappedCursor = {
    ...result,
    fetch: () => {
      const docs = result.fetch()
      return docs.map(doc => wrapWithProxy(doc, this._name))
    },
    forEach: (callback) => {
      result.forEach((doc) => {
        callback(wrapWithProxy(doc, this._name))
      })
    }
  }

  return wrappedCursor
}

function wrapWithProxy(doc: any, collectionName: string) {
  const accessedFields = new Set<string>()

  return new Proxy(doc, {
    get(target, prop) {
      accessedFields.add(prop.toString())

      sendMessage('field-access', {
        collection: collectionName,
        field: prop.toString(),
        timestamp: Date.now()
      })

      return target[prop]
    }
  })
}
```

**Why Opt-In?**
- ✅ No performance impact by default
- ✅ Power users can enable for deep analysis
- ✅ Clear warning about performance
- ✅ Can be toggled on/off easily

**Files Modified:**
- `src/Stores/Panel/SettingStore.ts`
- `src/Pages/Panel/Settings/index.tsx`
- `src/Injectors/MeteorAdapter.ts`

---

## Task 4: Auditor Panel UI (2h)

```typescript
// src/Pages/Panel/Auditor/index.tsx
import { observer } from 'mobx-react'
import { Card, Tag } from '@blueprintjs/core'
import { auditor } from '../../../Services/Auditor'

export const AuditorPanel = observer(() => {
  const {
    overFetchingIssues,
    missingIndexIssues,
    largePayloadIssues,
    nPlusOneIssues,
    overlappingSubscriptions
  } = auditor

  const allIssues = [
    ...overFetchingIssues,
    ...missingIndexIssues,
    ...largePayloadIssues,
    ...nPlusOneIssues,
    ...overlappingSubscriptions
  ]

  return (
    <div className="auditor-panel">
      <h2>Intelligent Auditor ({allIssues.length} issues found)</h2>

      {allIssues.length === 0 && (
        <Card>
          <p>✅ No performance issues detected!</p>
        </Card>
      )}

      {allIssues.map((issue, i) => (
        <Card key={i}>
          <Tag intent={issue.severity === 'HIGH' ? 'danger' : 'warning'}>
            {issue.severity}
          </Tag>
          <Tag>{issue.type}</Tag>
          <p><strong>{issue.message}</strong></p>
          <p><em>Recommendation:</em> {issue.recommendation}</p>
        </Card>
      ))}
    </div>
  )
})
```

**Files Created:** `src/Pages/Panel/Auditor/index.tsx`

---

## Integration Checklist

- ✅ Auditor detects 6 types of issues
- ✅ Overlapping subscriptions flagged
- ✅ Opt-in Proxy field tracking available
- ✅ Auditor panel renders with actionable recommendations
- ✅ Tests passing

---

## Files Summary

**Created (2 files):**
1. `src/Services/Auditor.ts`
2. `src/Pages/Panel/Auditor/index.tsx`

**Modified (3 files):**
1. `src/Stores/Panel/SettingStore.ts`
2. `src/Pages/Panel/Settings/index.tsx`
3. `src/Injectors/MeteorAdapter.ts`

**Total LOC:** ~500 lines
