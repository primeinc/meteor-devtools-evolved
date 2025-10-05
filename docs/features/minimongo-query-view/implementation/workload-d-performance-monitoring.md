# Workload D: Performance Monitoring

**Owner:** Dev D
**Effort:** 5-6 hours (Iteration 5)
**Dependencies:** Workload B (needs byte size tracking)
**Outputs:** PerformanceObserver integration, memory leak workflow, DDP-performance correlation

---

## Overview

Connects Meteor-specific events with standardized web performance metrics. Draws a direct line from DDP message volume to UI jank.

**Dependency:** Needs `DDPStore.byteSize` from Workload B for correlation.

---

## Task 1: Add PerformanceObserver for Long Tasks (1h)

**Goal:** Detect main-thread blocking using browser PerformanceObserver API.

```typescript
// src/Browser/Inject.ts (add during initialization)
if ('PerformanceObserver' in window) {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      sendMessage('performance-longtask', {
        name: entry.name,
        duration: entry.duration,
        startTime: entry.startTime,
        attribution: entry.attribution
      })
    }
  })

  observer.observe({ type: 'longtask', buffered: true })
}
```

**Update PerformanceStore:**

```typescript
// src/Stores/Panel/PerformanceStore.ts
export class PerformanceStore {
  @observable longTasks: LongTask[] = []

  @action
  addLongTask(task: LongTask) {
    this.longTasks.push(task)
  }

  @computed
  get criticalTasks() {
    return this.longTasks.filter(task => task.duration > 100)  // >100ms
  }
}

interface LongTask {
  name: string
  duration: number
  startTime: number
  attribution?: any
}
```

**Files Modified:** `src/Browser/Inject.ts`, `src/Stores/Panel/PerformanceStore.ts`

---

## Task 2: Memory Leak Workflow (2h)

**Goal:** Compare Minimongo collection snapshots to detect leaks.

```typescript
// src/Stores/Panel/MinimongoStore/index.ts
export class MinimongoStore {
  @observable snapshots: CollectionSnapshot[] = []

  @action
  recordSnapshot(label?: string) {
    const snapshot: Record<string, number> = {}

    Object.keys(this.collections).forEach(name => {
      snapshot[name] = this.collections[name].length
    })

    this.snapshots.push({
      label: label || `Snapshot ${this.snapshots.length + 1}`,
      timestamp: Date.now(),
      counts: snapshot
    })
  }

  @computed
  get snapshotComparison() {
    if (this.snapshots.length < 2) return null

    const first = this.snapshots[0]
    const last = this.snapshots[this.snapshots.length - 1]

    const deltas: Record<string, number> = {}
    Object.keys(last.counts).forEach(collection => {
      const delta = last.counts[collection] - (first.counts[collection] || 0)
      if (delta !== 0) {
        deltas[collection] = delta
      }
    })

    return {
      first: first.label,
      last: last.label,
      timeElapsed: last.timestamp - first.timestamp,
      deltas
    }
  }
}

interface CollectionSnapshot {
  label: string
  timestamp: number
  counts: Record<string, number>
}
```

**UI:**

```typescript
// src/Pages/Panel/Performance/MemoryLeakDetector.tsx
export const MemoryLeakDetector = observer(() => {
  const { snapshots, snapshotComparison } = PanelStore.minimongoStore

  return (
    <div>
      <Button onClick={() => PanelStore.minimongoStore.recordSnapshot()}>
        Take Snapshot
      </Button>

      {snapshotComparison && (
        <Card>
          <h3>Snapshot Comparison</h3>
          <p>{snapshotComparison.first} → {snapshotComparison.last}</p>
          <p>Time Elapsed: {snapshotComparison.timeElapsed}ms</p>
          <HTMLTable>
            <thead>
              <tr>
                <th>Collection</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(snapshotComparison.deltas).map(([collection, delta]) => (
                <tr key={collection}>
                  <td>{collection}</td>
                  <td className={delta > 0 ? 'increase' : 'decrease'}>
                    {delta > 0 ? '+' : ''}{delta} documents
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        </Card>
      )}
    </div>
  )
})
```

**Files Modified:** `src/Stores/Panel/MinimongoStore/index.ts`
**Files Created:** `src/Pages/Panel/Performance/MemoryLeakDetector.tsx`

---

## Task 3: Correlate Performance with DDP Activity (2h)

**Goal:** Link long tasks to DDP message bursts.

```typescript
// src/Services/PerformanceCorrelator.ts
import { computed } from 'mobx'
import { PanelStore } from '../Stores/PanelStore'

export class PerformanceCorrelator {
  @computed
  get ddpCausedLongTasks() {
    const correlations = []
    const longTasks = PanelStore.performanceStore.criticalTasks

    for (const task of longTasks) {
      // Find DDP activity within 50ms before task
      const suspectDDP = PanelStore.ddpStore.collection.filter(log =>
        log.timestamp < task.startTime &&
        log.timestamp > task.startTime - 50
      )

      if (suspectDDP.length > 0) {
        const totalBytes = suspectDDP.reduce((sum, log) => sum + (log.byteSize || 0), 0)

        correlations.push({
          task,
          suspectDDP,
          totalBytes,
          confidence: suspectDDP.length > 5 ? 'HIGH' : 'MEDIUM'
        })
      }
    }

    return correlations
  }
}

export const performanceCorrelator = new PerformanceCorrelator()
```

**UI Enhancement:**

```typescript
// src/Pages/Panel/Performance/index.tsx
export const PerformancePanel = observer(() => {
  const { ddpCausedLongTasks } = performanceCorrelator

  return (
    <div>
      <h2>Performance Analysis</h2>

      <section>
        <h3>DDP-Caused Long Tasks ({ddpCausedLongTasks.length})</h3>
        {ddpCausedLongTasks.map((correlation, i) => (
          <Card key={i}>
            <Tag intent="danger">UI BLOCK</Tag>
            <p><strong>Task Duration:</strong> {correlation.task.duration.toFixed(2)}ms</p>
            <p><strong>Suspect DDP Messages:</strong> {correlation.suspectDDP.length}</p>
            <p><strong>Total Bytes:</strong> {formatBytes(correlation.totalBytes)}</p>
            <p><strong>Confidence:</strong> {correlation.confidence}</p>
          </Card>
        ))}
      </section>

      <MemoryLeakDetector />
    </div>
  )
})
```

**Gotcha:** A large initial data load for a subscription can freeze the UI. The browser's main thread gets blocked parsing the large volume of incoming DDP messages. The correlation between `longtask` events and DDP activity makes this immediately obvious.

**Files Created:** `src/Services/PerformanceCorrelator.ts`, `src/Pages/Panel/Performance/index.tsx`

---

## Integration Checklist

- ✅ PerformanceObserver tracking long tasks
- ✅ Memory leak workflow with snapshot comparison
- ✅ DDP-performance correlation showing byte volumes
- ✅ UI renders performance metrics

**Handoff:** PerformanceStore + PerformanceCorrelator available for Workload E

---

## Files Summary

**Created (3 files):**
1. `src/Services/PerformanceCorrelator.ts`
2. `src/Pages/Panel/Performance/MemoryLeakDetector.tsx`
3. `src/Pages/Panel/Performance/index.tsx`

**Modified (3 files):**
1. `src/Browser/Inject.ts`
2. `src/Stores/Panel/PerformanceStore.ts`
3. `src/Stores/Panel/MinimongoStore/index.ts`

**Total LOC:** ~350 lines
