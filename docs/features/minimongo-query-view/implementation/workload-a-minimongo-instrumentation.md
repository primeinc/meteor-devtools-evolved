# Workload A: Minimongo Instrumentation & Correlation

**Owner:** Dev A
**Effort:** 8-12 hours (Iteration 1 + Iteration 2 combined)
**Dependencies:** None - can start immediately
**Outputs:** Query logging, DDP correlation service

---

## Overview

This workload instruments Minimongo operations to capture query logs with stack traces, then correlates those queries with DDP activity. This is the **primary feature** of the entire project.

**Why combined?** Same developer owns the Minimongo data pipeline from instrumentation → storage → correlation. Sequential work, but natural flow.

---

## Part 1: Minimongo Query View (4.5-7.5h)

### 1.1 Extend MeteorAdapter.ts Method Wrapping (1-2h)

**Current State:** `src/Injectors/MeteorAdapter.ts:28-53` already wraps ALL Minimongo methods for performance tracking.

**Task:** Enhance wrapping to capture stack traces and query details.

**Implementation:**

```typescript
// src/Injectors/MeteorAdapter.ts
Object.entries(Mongo.Collection.prototype).forEach(([key, val]) => {
  if (['find', 'findOne', 'insert', 'update', 'upsert', 'remove'].includes(key)) {
    const original = prototype[key]

    prototype[key] = function (...args) {
      const startMs = Date.now()

      // Conditional stack trace (performance-sensitive)
      const stackTrace = PanelStore?.settingStore?.isQueryStackTraceEnabled
        ? new Error().stack
        : undefined

      const result = original.apply(this, args)

      sendMessage('minimongo-method', {
        collectionName: this._name,
        method: key,
        selector: args[0],
        modifier: args[1],  // For update/upsert
        options: args[2],   // For find (fields, sort, limit)
        runtime: Date.now() - startMs,
        stackTrace: stackTrace,
        timestamp: Date.now()
      })

      return result
    }
  }
})
```

**Gotcha:** Stack trace capture can slow down high-frequency queries. Make it toggleable via `SettingStore.isQueryStackTraceEnabled` (default: false).

**Files to Modify:**
- `src/Injectors/MeteorAdapter.ts` (extend existing wrapping)
- `src/Stores/Panel/SettingStore.ts` (add `@observable isQueryStackTraceEnabled = false`)

---

### 1.2 Create MinimongoStore.methodLogs Observable (30m)

**Pattern to Copy:** `DDPStore.collection` observable array

**Task:** Add new observable array to track query logs.

**Implementation:**

```typescript
// src/Stores/Panel/MinimongoStore/index.ts
import { observable, action, computed, makeObservable } from 'mobx'

export class MinimongoStore {
  // Existing observables...
  @observable collections = {}

  // NEW: Query logs
  @observable methodLogs: MinimongoMethodLog[] = []

  @action
  addMethodLog(log: MinimongoMethodLog) {
    this.methodLogs.push(log)

    // Limit to 1000 entries (prevent memory leaks)
    if (this.methodLogs.length > 1000) {
      this.methodLogs.shift()
    }
  }

  @computed
  get findLogs() {
    return this.methodLogs.filter(log =>
      log.method === 'find' || log.method === 'findOne'
    )
  }

  @computed
  get mutateLogs() {
    return this.methodLogs.filter(log =>
      ['insert', 'update', 'upsert', 'remove'].includes(log.method)
    )
  }
}

interface MinimongoMethodLog {
  collectionName: string
  method: string
  selector: any
  modifier?: any
  options?: any
  runtime: number
  stackTrace?: string
  timestamp: number
}
```

**Files to Create:**
- `src/Stores/Panel/MinimongoStore/types.ts` (MinimongoMethodLog interface)

**Files to Modify:**
- `src/Stores/Panel/MinimongoStore/index.ts` (add methodLogs observable)

---

### 1.3 Add Bridge Receiver (15m)

**Pattern to Copy:** Existing `ddp-event` receiver in `Bridge.ts:86-132`

**Task:** Add message handler for `minimongo-method` events.

**Implementation:**

```typescript
// src/Bridge.ts
case 'minimongo-method':
  PanelStore.minimongoStore.addMethodLog(message.data)
  break
```

**Files to Modify:**
- `src/Bridge.ts` (add new case in message switch)

---

### 1.4 Create QueryLogRow/QueryLogList UI (2-3h)

**Pattern to Copy:** `src/Pages/Panel/DDP/components/DDPLogRow.tsx`

**Task:** Build virtualized list UI for query logs.

**Implementation:**

```typescript
// src/Pages/Panel/Minimongo/components/QueryLogRow.tsx
import { observer } from 'mobx-react'
import { Card } from '@blueprintjs/core'

interface QueryLogRowProps {
  log: MinimongoMethodLog
}

export const QueryLogRow = observer(({ log }: QueryLogRowProps) => {
  return (
    <Card interactive>
      <div className="method-badge">{log.method}</div>
      <div className="collection-name">{log.collectionName}</div>
      <div className="runtime">{log.runtime}ms</div>
      <div className="selector">{JSON.stringify(log.selector)}</div>

      {/* Collapsible stack trace (only if enabled) */}
      {log.stackTrace && (
        <details>
          <summary>Stack Trace</summary>
          <pre>{log.stackTrace}</pre>
        </details>
      )}
    </Card>
  )
})
```

```typescript
// src/Pages/Panel/Minimongo/components/QueryLogList.tsx
import { observer } from 'mobx-react'
import { FixedSizeList } from 'react-window'
import { PanelStore } from '../../../../Stores/PanelStore'

export const QueryLogList = observer(() => {
  const logs = PanelStore.minimongoStore.findLogs  // Use @computed getter

  return (
    <FixedSizeList
      height={600}
      itemCount={logs.length}
      itemSize={80}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <QueryLogRow log={logs[index]} />
        </div>
      )}
    </FixedSizeList>
  )
})
```

**Files to Create:**
- `src/Pages/Panel/Minimongo/components/QueryLogRow.tsx`
- `src/Pages/Panel/Minimongo/components/QueryLogList.tsx`

**Files to Modify:**
- `src/Pages/Panel/Minimongo/index.tsx` (add QueryLogList to tab)

---

### 1.5 Add Tests (1-2h)

**Pattern to Copy:** Existing tests in `src/Pages/Panel/Minimongo/services/__tests__/`

**Test Cases:**

```typescript
// src/Stores/Panel/MinimongoStore/__tests__/MinimongoStore.test.ts
describe('MinimongoStore', () => {
  it('should add method logs', () => {
    const store = new MinimongoStore()
    store.addMethodLog({
      collectionName: 'users',
      method: 'find',
      selector: { _id: '123' },
      runtime: 5,
      timestamp: Date.now()
    })

    expect(store.methodLogs.length).toBe(1)
    expect(store.findLogs.length).toBe(1)
  })

  it('should limit logs to 1000 entries', () => {
    const store = new MinimongoStore()
    for (let i = 0; i < 1001; i++) {
      store.addMethodLog({
        collectionName: 'test',
        method: 'find',
        selector: {},
        runtime: 1,
        timestamp: Date.now()
      })
    }

    expect(store.methodLogs.length).toBe(1000)
  })

  it('should filter find vs mutate logs', () => {
    const store = new MinimongoStore()

    store.addMethodLog({ method: 'find', collectionName: 'users', selector: {}, runtime: 1, timestamp: Date.now() })
    store.addMethodLog({ method: 'insert', collectionName: 'users', selector: {}, runtime: 1, timestamp: Date.now() })

    expect(store.findLogs.length).toBe(1)
    expect(store.mutateLogs.length).toBe(1)
  })
})
```

**Files to Create:**
- `src/Stores/Panel/MinimongoStore/__tests__/MinimongoStore.test.ts`

---

## Part 2: DDP Correlation (4-5h)

**Dependency:** Requires Part 1 (MinimongoStore.methodLogs) to be complete.

### 2.1 Create MinimongoDDPCorrelator.ts (2-3h)

**Pattern to Copy:** `DDPStore.getSubscriptionMeta()` correlation methods

**Task:** Build service to correlate Minimongo queries with DDP activity.

**Implementation:**

```typescript
// src/Services/MinimongoDDPCorrelator.ts
import { PanelStore } from '../Stores/PanelStore'
import { computed } from 'mobx'

export class MinimongoDDPCorrelator {
  /**
   * Find DDP messages that added documents to a collection
   */
  @computed
  getDDPAddsForCollection(collectionName: string) {
    return PanelStore.ddpStore.collection.filter(log =>
      log.parsedContent.msg === 'added' &&
      log.parsedContent.collection === collectionName
    )
  }

  /**
   * Find DDP messages that changed documents in a collection
   */
  @computed
  getDDPChangesForCollection(collectionName: string) {
    return PanelStore.ddpStore.collection.filter(log =>
      log.parsedContent.msg === 'changed' &&
      log.parsedContent.collection === collectionName
    )
  }

  /**
   * Correlate a Minimongo query with DDP activity
   * Uses 100ms time window for correlation
   */
  getCorrelationForQuery(log: MinimongoMethodLog) {
    const { collectionName, timestamp } = log

    // Find recent DDP activity (within 100ms)
    const recentDDP = PanelStore.ddpStore.collection.filter(ddpLog =>
      ddpLog.parsedContent.collection === collectionName &&
      Math.abs(ddpLog.timestamp - timestamp) < 100
    )

    return {
      addedDocuments: recentDDP.filter(l => l.parsedContent.msg === 'added').length,
      changedDocuments: recentDDP.filter(l => l.parsedContent.msg === 'changed').length,
      removedDocuments: recentDDP.filter(l => l.parsedContent.msg === 'removed').length,
      correlationConfidence: recentDDP.length > 0 ? 'HIGH' : 'NONE'
    }
  }
}

export const minimongoCorrelator = new MinimongoDDPCorrelator()
```

**Files to Create:**
- `src/Services/MinimongoDDPCorrelator.ts`

---

### 2.2 Add Correlation Badges to UI (1h)

**Task:** Enhance QueryLogRow to show DDP correlation.

**Implementation:**

```typescript
// src/Pages/Panel/Minimongo/components/QueryLogRow.tsx (enhance)
import { Tag } from '@blueprintjs/core'
import { minimongoCorrelator } from '../../../../Services/MinimongoDDPCorrelator'

export const QueryLogRow = observer(({ log }: QueryLogRowProps) => {
  const correlation = minimongoCorrelator.getCorrelationForQuery(log)

  return (
    <Card interactive>
      {/* Existing fields... */}

      {/* NEW: Correlation badge */}
      {correlation.correlationConfidence === 'HIGH' && (
        <Tag intent="success">
          DDP: {correlation.addedDocuments}↑ {correlation.changedDocuments}↻ {correlation.removedDocuments}↓
        </Tag>
      )}
    </Card>
  )
})
```

**Files to Modify:**
- `src/Pages/Panel/Minimongo/components/QueryLogRow.tsx`

---

### 2.3 Add Tests (1h)

```typescript
// src/Services/__tests__/MinimongoDDPCorrelator.test.ts
describe('MinimongoDDPCorrelator', () => {
  it('should correlate query with DDP adds', () => {
    // Setup: Add DDP 'added' message to DDPStore
    PanelStore.ddpStore.collection.push({
      parsedContent: { msg: 'added', collection: 'users' },
      timestamp: 1000
    })

    // Act: Query happened at similar time
    const log = {
      collectionName: 'users',
      method: 'find',
      selector: {},
      runtime: 5,
      timestamp: 1050  // Within 100ms
    }

    const correlation = minimongoCorrelator.getCorrelationForQuery(log)

    // Assert
    expect(correlation.addedDocuments).toBe(1)
    expect(correlation.correlationConfidence).toBe('HIGH')
  })

  it('should return NONE confidence when no DDP activity', () => {
    const log = {
      collectionName: 'users',
      method: 'find',
      selector: {},
      runtime: 5,
      timestamp: Date.now()
    }

    const correlation = minimongoCorrelator.getCorrelationForQuery(log)

    expect(correlation.correlationConfidence).toBe('NONE')
  })
})
```

**Files to Create:**
- `src/Services/__tests__/MinimongoDDPCorrelator.test.ts`

---

## Integration Checklist

**Part 1 Complete When:**
- ✅ Minimongo queries logged with stack traces
- ✅ Query list UI renders with virtualization
- ✅ Stack trace toggle works in Settings
- ✅ Tests passing

**Part 2 Complete When:**
- ✅ DDP correlation badges appear on query rows
- ✅ Correlation confidence scoring works
- ✅ Tests passing

**Handoff to Other Workloads:**
- ✅ `MinimongoStore.methodLogs` available for Workload E (Auditor)
- ✅ `minimongoCorrelator` service available for Workload E

---

## Files Summary

**Created (8 files):**
1. `src/Stores/Panel/MinimongoStore/types.ts`
2. `src/Pages/Panel/Minimongo/components/QueryLogRow.tsx`
3. `src/Pages/Panel/Minimongo/components/QueryLogList.tsx`
4. `src/Services/MinimongoDDPCorrelator.ts`
5. `src/Stores/Panel/MinimongoStore/__tests__/MinimongoStore.test.ts`
6. `src/Services/__tests__/MinimongoDDPCorrelator.test.ts`

**Modified (6 files):**
1. `src/Injectors/MeteorAdapter.ts`
2. `src/Stores/Panel/MinimongoStore/index.ts`
3. `src/Stores/Panel/SettingStore.ts`
4. `src/Bridge.ts`
5. `src/Pages/Panel/Minimongo/index.tsx`
6. `src/Pages/Panel/Minimongo/components/QueryLogRow.tsx` (modified twice - Part 1 creates, Part 2 enhances)

**Total LOC:** ~600 lines of new code
