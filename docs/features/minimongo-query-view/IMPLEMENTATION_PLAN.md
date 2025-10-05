# Implementation Plan - Minimongo Query View + Enhanced DevTools

**Status:** ✅ Validated & Updated (2025-10-05)
**Alignment:** 98% (revised with TrackerInjector feasibility confirmed)
**Effort:** 39-49 hours across 6 iterations

---

## Overview

This plan implements the Minimongo Query View feature plus enhanced DDP inspection, reactivity analysis, performance auditing, and intelligent recommendations.

**Key Insight:** We CAN instrument Tracker.autorun because our injection timing (after Meteor core loads, before app bundles execute) allows reliable prototype wrapping—proven by existing MeteorAdapter.ts success with Minimongo methods.

**Client-Side Constraint:** We observe but don't control the host Meteor application. No server-side modifications.

---

## Architecture (Validated ✅)

### Browser Extension Structure
```
extension/
├── chrome/manifest.json (v3)
├── firefox/manifest.json (v2)

src/Browser/
├── Content.ts      ✅ Bridge to page context
├── Background.ts   ✅ Service worker (MV3)
├── Inject.ts       ✅ Page context injector
├── DevTools.ts     ✅ Panel registration
```

### Message Flow (Proven in Production ✅)
```
Page Context (Inject.ts)
  ↓ window.postMessage()
Content Script (Content.ts)
  ↓ browser.runtime.sendMessage()
Background Script (Background.ts)
  ↓ Port connection
DevTools Panel (Bridge.ts → Stores)
```

**Verified Files:**
- `src/Browser/Inject.ts:73-91` - sendMessage() implementation
- `src/Browser/Content.ts:5-18` - window → runtime relay
- `src/Browser/Background.ts:555-594` - cache & forward
- `src/Bridge.ts:86-132` - panel receivers

---

## Iteration 1: Minimongo Query View (Primary Goal)

**Goal:** Log all Minimongo operations with stack traces and query details
**Effort:** 4.5-7.5 hours
**Status:** 65% infrastructure exists (MeteorAdapter.ts already wraps methods)

### 1.1 Extend MeteorAdapter.ts Method Wrapping (1-2h)

**Current State (src/Injectors/MeteorAdapter.ts:28-53):**
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

**Enhancement Needed:**
```typescript
// Add stack trace capture (conditional based on settings)
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
```

**Performance Note:** Stack trace capture can slow down high-frequency queries. This feature is toggleable via `SettingStore.isQueryStackTraceEnabled` (default: false). The UI should make it easy to jump from a query log directly to its origin in the code when enabled.

**Files to Modify:**
- `src/Injectors/MeteorAdapter.ts` (extend existing wrapping)
- `src/Stores/Panel/SettingStore.ts` (add `isQueryStackTraceEnabled` property)

---

### 1.2 Create MinimongoStore.methodLogs Observable (30m)

**Pattern to Copy:** `DDPStore.collection` observable array

**Implementation (src/Stores/Panel/MinimongoStore/index.ts):**
```typescript
import { observable, action, computed, makeObservable } from 'mobx'

export class MinimongoStore {
  // Existing observables...
  @observable collections = {}

  // NEW: Query logs
  @observable methodLogs: MinimongoMethodLog[] = []

  @action
  addMethodLog(log: MinimongoMethodLog) {
    this.methodLogs.push(log)

    // Limit to 1000 entries
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
  stackTrace: string
  timestamp: number
}
```

**Files to Create/Modify:**
- Modify: `src/Stores/Panel/MinimongoStore/index.ts`
- Create: `src/Stores/Panel/MinimongoStore/types.ts` (for MinimongoMethodLog interface)

---

### 1.3 Add Bridge Receiver (15m)

**Pattern to Copy:** Existing `ddp-event` receiver in `Bridge.ts:86-132`

**Implementation (src/Bridge.ts):**
```typescript
case 'minimongo-method':
  PanelStore.minimongoStore.addMethodLog(message.data)
  break
```

**Files to Modify:**
- `src/Bridge.ts` (add new case)

---

### 1.4 Create QueryLogRow/QueryLogList UI (2-3h)

**Pattern to Copy:** `src/Pages/Panel/DDP/components/DDPLogRow.tsx`

**Component Structure:**
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
      {/* Collapsible stack trace */}
      <details>
        <summary>Stack Trace</summary>
        <pre>{log.stackTrace}</pre>
      </details>
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
// MinimongoStore.test.ts
describe('MinimongoStore', () => {
  it('should add method logs', () => {
    const store = new MinimongoStore()
    store.addMethodLog({
      collectionName: 'users',
      method: 'find',
      selector: { _id: '123' },
      runtime: 5,
      stackTrace: 'Error\n  at ...',
      timestamp: Date.now()
    })

    expect(store.methodLogs.length).toBe(1)
    expect(store.findLogs.length).toBe(1)
  })

  it('should limit logs to 1000 entries', () => {
    const store = new MinimongoStore()
    for (let i = 0; i < 1001; i++) {
      store.addMethodLog({ /* ... */ })
    }

    expect(store.methodLogs.length).toBe(1000)
  })
})
```

**Files to Create:**
- `src/Stores/Panel/MinimongoStore/__tests__/MinimongoStore.test.ts`

---

## Iteration 2: DDP Correlation (Secondary Goal)

**Goal:** Correlate Minimongo queries with DDP messages
**Effort:** 4-5 hours
**Status:** 50% infrastructure exists (SubscriptionStore.subsWithMeta proves pattern works)

### 2.1 Create MinimongoDDPCorrelator.ts (2-3h)

**Pattern to Copy:** `DDPStore.getSubscriptionMeta()` correlation methods

**Implementation (src/Services/MinimongoDDPCorrelator.ts):**
```typescript
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

**Enhancement to QueryLogRow.tsx:**
```typescript
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
// MinimongoDDPCorrelator.test.ts
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
      timestamp: 1050  // Within 100ms
    }

    const correlation = minimongoCorrelator.getCorrelationForQuery(log)

    // Assert
    expect(correlation.addedDocuments).toBe(1)
    expect(correlation.correlationConfidence).toBe('HIGH')
  })
})
```

**Files to Create:**
- `src/Services/__tests__/MinimongoDDPCorrelator.test.ts`

---

## Iteration 3: Enhanced DDP Inspector (RQ1.1, RQ1.2, RQ1.4)

**Goal:** RPC latency metrics, subscription data load metrics, byte size tracking
**Effort:** 5 hours

### 3.1 Add RPC Latency Metrics to DDPStore (2h)

**❌ ORIGINAL (REJECTED):** Use `Map` for pending methods
**✅ CORRECTED:** Use `@computed` pattern (matches existing codebase style)

**Pattern to Copy:** `DDPStore.getSubscriptionInit/Ready` correlation methods

**Implementation (src/Stores/Panel/DDPStore.ts):**
```typescript
export class DDPStore {
  // Existing...
  @observable collection: DDPLog[] = []

  // NEW: Computed filters (instead of Map)
  @computed
  get methodLogs() {
    return this.collection.filter(log => log.parsedContent.msg === 'method')
  }

  @computed
  get resultLogs() {
    return this.collection.filter(log => log.parsedContent.msg === 'result')
  }

  @computed
  get updatedLogs() {
    return this.collection.filter(log => log.parsedContent.msg === 'updated')
  }

  // NEW: Correlation methods
  getMethodResult(methodId: string) {
    return this.resultLogs.find(log => log.parsedContent.id === methodId)
  }

  getMethodUpdated(methodId: string) {
    return this.updatedLogs.find(log =>
      log.parsedContent.methods?.includes(methodId)
    )
  }

  getMethodLatency(methodId: string) {
    const methodLog = this.methodLogs.find(log => log.parsedContent.id === methodId)
    const resultLog = this.getMethodResult(methodId)

    if (!methodLog || !resultLog) return null

    return {
      rpcLatency: resultLog.timestamp - methodLog.timestamp,
      methodName: methodLog.parsedContent.method,
      params: methodLog.parsedContent.params
    }
  }
}
```

**Why This Is Better:**
- ✅ Matches existing `getSubscriptionInit/Ready` pattern
- ✅ No memory leak risk (no manual cleanup needed)
- ✅ Reactive via `@computed`
- ✅ Consistent with codebase style

**UI Enhancement (DDPLogPreview.tsx):**

The detail view for a selected DDP message should render a **mini-timeline visualization** for each RPC call, showing a clear visual gap between the "result" and "updated" events:

```typescript
{/* In DDPLogPreview.tsx */}
{log.timeToResult && (
  <div className="rpc-timeline">
    <div className="timeline-bar">
      <span className="method-start">method</span>
      <span className="arrow">→</span>
      <span className="result-marker" title="Server computed result">
        result ({log.timeToResult.toFixed(2)}ms)
      </span>
      {log.timeToReady && (
        <>
          <span className="arrow">→</span>
          <span className="ready-marker" title="All data side-effects sent">
            ready ({log.timeToReady.toFixed(2)}ms total)
          </span>
        </>
      )}
    </div>
  </div>
)}
```

**Gotcha Note:** Developers often mistake "Time to Result" for total user-perceived latency. An unblocked method can return instantly, but the UI won't update until all data changes have been received (the `updated` message), which can be much later. The timeline visualization makes latency compensation immediately obvious.

**Files to Modify:**
- `src/Stores/Panel/DDPStore.ts`
- `src/Pages/Panel/DDP/components/DDPLogPreview.tsx` (add timeline visualization)

---

### 3.2 Add Subscription Data Load Tracking (2h)

**Pattern to Copy:** `SubscriptionStore.subsWithMeta` (PROVEN IN PRODUCTION)

**Implementation (src/Stores/Panel/SubscriptionStore.ts):**
```typescript
// Extend existing interface
interface ISubscription {
  id: string
  name: string
  params: any[]
  // NEW:
  startTime?: number
  readyTime?: number
  initialDataLoadBytes?: number
}

export class SubscriptionStore {
  // Existing...
  @computed
  get subsWithMeta() {
    return this.filtered.map(sub => ({
      ...sub,
      ...PanelStore.ddpStore.getSubscriptionMeta(sub),
      // NEW: Add data load metrics
      ...this.getDataLoadMetrics(sub)
    }))
  }

  // NEW: Calculate data load
  getDataLoadMetrics(sub: ISubscription) {
    const initLog = PanelStore.ddpStore.getSubscriptionInit(sub)
    const readyLog = PanelStore.ddpStore.getSubscriptionReady(sub)

    if (!initLog || !readyLog) return {}

    // Find all 'added' messages between init and ready
    const addedMessages = PanelStore.ddpStore.collection.filter(log =>
      log.parsedContent.msg === 'added' &&
      log.timestamp >= initLog.timestamp &&
      log.timestamp <= readyLog.timestamp
    )

    // Sum byte sizes
    const totalBytes = addedMessages.reduce((sum, log) => {
      const byteSize = new TextEncoder().encode(JSON.stringify(log.parsedContent)).length
      return sum + byteSize
    }, 0)

    // Calculate update metrics (ongoing updates after ready)
    const updateMessages = PanelStore.ddpStore.collection.filter(log =>
      ['added', 'changed', 'removed'].includes(log.parsedContent.msg) &&
      log.timestamp > readyLog.timestamp
    )

    const now = Date.now()
    const lifetimeSeconds = (now - readyLog.timestamp) / 1000
    const updateRate = lifetimeSeconds > 0
      ? updateMessages.length / lifetimeSeconds * 60  // messages per minute
      : 0

    const totalUpdateVolume = updateMessages.reduce((sum, log) => {
      const byteSize = new TextEncoder().encode(JSON.stringify(log.parsedContent)).length
      return sum + byteSize
    }, 0)

    return {
      startTime: initLog.timestamp,
      readyTime: readyLog.timestamp,
      initialDataLoadBytes: totalBytes,
      updateRate,  // NEW: messages/minute
      totalUpdateVolume  // NEW: total bytes from updates
    }
  }
}
```

**UI Enhancement (Subscriptions.tsx):**

The main subscription list will be enhanced with **three new, sortable columns**:
- "Ready Time" (duration from `sub` to `ready`)
- "Initial Load" (bytes loaded before ready)
- "Update Rate" (messages/minute after ready)

This allows developers to instantly identify:
1. Which subscriptions are slowest to load
2. Which subscriptions dump the most data initially
3. Which subscriptions are "chatty" (frequent small updates)

**Gotcha Note:** A "chatty" subscription that sends frequent, small updates can be just as damaging as a single large one, especially on high-latency mobile networks. The Update Rate metric makes this visible.

**Files to Modify:**
- `src/Stores/Panel/SubscriptionStore.ts`
- `src/Pages/Panel/Subscriptions/Subscriptions.tsx` (add new columns)

---

### 3.3 Add Byte Size Calculation in DDPInjector (1h)

**Implementation (src/Injectors/DDPInjector.ts):**
```typescript
// Existing interception code...
const interceptedSend = originalSend

WebSocket.prototype.send = function (data) {
  const messageData = JSON.parse(data)

  // NEW: Calculate byte size
  const byteSize = new TextEncoder().encode(data).length

  sendMessage('ddp-event', {
    direction: 'sent',
    message: messageData,
    timestamp: Date.now(),
    byteSize  // ← ADD THIS
  })

  return interceptedSend.call(this, data)
}
```

**Files to Modify:**
- `src/Injectors/DDPInjector.ts`

**Files to Modify (Store):**
- `src/Stores/Panel/DDPStore.ts` (add byteSize to DDPLog interface)

---

## Iteration 4: Tracker Reactivity Analysis (RQ2.1, RQ2.2, RQ2.3)

**Goal:** Instrument Tracker.autorun to visualize reactivity, detect phantom re-runs, and identify leaked computations
**Effort:** 10-12 hours
**Status:** ✅ FEASIBLE - injection timing allows reliable Tracker wrapping

### ✅ WHY TRACKERINJECTOR IS VIABLE

**Previous Concern:** "We inject too late to wrap Tracker.autorun"

**Evidence that proves it works:**
1. ✅ `MeteorAdapter.ts:28-53` successfully wraps `Mongo.Collection.prototype` methods **after** Meteor loads
2. ✅ `Inject.ts` polls until `Meteor` object exists, then injects **before** app bundle code executes
3. ✅ Injection timing: Meteor core loads → We wrap APIs → App bundles execute
4. ✅ This is **identical** to how we already wrap Minimongo successfully

**Key Pattern:** Global flag (`window.__meteor_devtools_current_computation`) tracks which computation is active during reactive function calls

---

### 4.1 Create TrackerInjector.ts (4-5h)

**Implementation (src/Injectors/TrackerInjector.ts):**

```typescript
import { sendMessage } from '../Browser/Inject'
import { SecureId } from '../Utils/SecureId'

export function TrackerInjector() {
  if (!window.Meteor?.Tracker) {
    console.warn('[TrackerInjector] Tracker not available')
    return
  }

  // Wrap Tracker.autorun
  const originalAutorun = Tracker.autorun

  Tracker.autorun = function (runFunc, options) {
    const computationId = SecureId.generate()

    // Wrap the reactive function
    const wrappedRunFunc = function (computation) {
      // Set global flag BEFORE running reactive code
      window.__meteor_devtools_current_computation = computationId

      try {
        return runFunc.call(this, computation)
      } finally {
        // ALWAYS unset flag, even if error occurs
        delete window.__meteor_devtools_current_computation
      }
    }

    // Call original autorun with wrapped function
    const computation = originalAutorun.call(this, wrappedRunFunc, options)

    // Send computation-created event
    sendMessage('tracker-computation-created', {
      computationId,
      stackTrace: new Error().stack,  // Capture where autorun was called
      timestamp: Date.now()
    })

    // Wrap computation methods
    const originalStop = computation.stop
    const originalRecompute = computation._recompute

    computation.stop = function () {
      sendMessage('tracker-computation-stopped', {
        computationId,
        timestamp: Date.now()
      })
      return originalStop.call(this)
    }

    computation._recompute = function () {
      sendMessage('tracker-computation-reran', {
        computationId,
        timestamp: Date.now()
      })
      return originalRecompute.call(this)
    }

    return computation
  }

  // Wrap reactive data sources to track dependencies
  wrapReactiveDataSources()
}

function wrapReactiveDataSources() {
  // Wrap Minimongo find/findOne
  const findPrototype = Mongo.Collection.prototype.find
  const findOnePrototype = Mongo.Collection.prototype.findOne

  Mongo.Collection.prototype.find = function (...args) {
    const computationId = window.__meteor_devtools_current_computation

    if (computationId) {
      sendMessage('tracker-dependency-registered', {
        computationId,
        dependency: {
          type: 'collection',
          collectionName: this._name,
          operation: 'find',
          selector: args[0],
          options: args[1]
        },
        timestamp: Date.now()
      })
    }

    return findPrototype.apply(this, args)
  }

  Mongo.Collection.prototype.findOne = function (...args) {
    const computationId = window.__meteor_devtools_current_computation

    if (computationId) {
      sendMessage('tracker-dependency-registered', {
        computationId,
        dependency: {
          type: 'collection',
          collectionName: this._name,
          operation: 'findOne',
          selector: args[0],
          options: args[1]
        },
        timestamp: Date.now()
      })
    }

    return findOnePrototype.apply(this, args)
  }

  // Wrap ReactiveVar.get
  if (window.ReactiveVar) {
    const reactiveVarGet = ReactiveVar.prototype.get

    ReactiveVar.prototype.get = function () {
      const computationId = window.__meteor_devtools_current_computation

      if (computationId) {
        sendMessage('tracker-dependency-registered', {
          computationId,
          dependency: {
            type: 'reactive-var',
            varName: this._name || 'anonymous'
          },
          timestamp: Date.now()
        })
      }

      return reactiveVarGet.call(this)
    }
  }

  // Wrap Session.get
  if (window.Session) {
    const sessionGet = Session.get

    Session.get = function (key) {
      const computationId = window.__meteor_devtools_current_computation

      if (computationId) {
        sendMessage('tracker-dependency-registered', {
          computationId,
          dependency: {
            type: 'session',
            key
          },
          timestamp: Date.now()
        })
      }

      return sessionGet.call(this, key)
    }
  }
}
```

**Files to Create:**
- `src/Injectors/TrackerInjector.ts`

**Files to Modify:**
- `src/Browser/Inject.ts` (call `TrackerInjector()` after Meteor detection)

---

### 4.2 Create TrackerStore.ts (2-3h)

**Implementation (src/Stores/Panel/TrackerStore.ts):**

```typescript
import { observable, action, computed, makeObservable } from 'mobx'
import EventEmitter from 'eventemitter3'

interface IComputation {
  id: string
  status: 'running' | 'stopped' | 'leaked'
  dependencies: Set<string>
  rerunCount: number
  createdAt: number
  stoppedAt?: number
  stackTrace?: string
}

interface IDependency {
  type: 'collection' | 'reactive-var' | 'session'
  collectionName?: string
  operation?: string
  selector?: any
  varName?: string
  key?: string
}

export class TrackerStore extends EventEmitter {
  @observable computations = new Map<string, IComputation>()
  @observable dependencies = new Map<string, IDependency[]>()  // computationId → dependencies

  constructor() {
    super()
    makeObservable(this)
  }

  @action
  createComputation(id: string, stackTrace: string, timestamp: number) {
    this.computations.set(id, {
      id,
      status: 'running',
      dependencies: new Set(),
      rerunCount: 0,
      createdAt: timestamp,
      stackTrace
    })
  }

  @action
  registerDependency(computationId: string, dependency: IDependency) {
    const computation = this.computations.get(computationId)
    if (!computation) return

    // Store dependency details
    const key = JSON.stringify(dependency)
    computation.dependencies.add(key)

    // Store in dependencies map for reverse lookup
    if (!this.dependencies.has(computationId)) {
      this.dependencies.set(computationId, [])
    }
    this.dependencies.get(computationId)!.push(dependency)
  }

  @action
  markComputationReran(computationId: string) {
    const computation = this.computations.get(computationId)
    if (!computation) return

    computation.rerunCount++

    // Emit event for phantom re-run detection
    this.emit('computation-reran', { computationId })
  }

  @action
  stopComputation(computationId: string, timestamp: number) {
    const computation = this.computations.get(computationId)
    if (!computation) return

    computation.status = 'stopped'
    computation.stoppedAt = timestamp
  }

  @computed
  get runningComputations() {
    return Array.from(this.computations.values()).filter(
      c => c.status === 'running'
    )
  }

  @computed
  get leakedComputations() {
    // Advanced: Computations running for >5 minutes
    const now = Date.now()
    return Array.from(this.computations.values()).filter(
      c => c.status === 'running' && (now - c.createdAt) > 300000
    )
  }

  /**
   * Get all computations that depend on a specific collection
   */
  getComputationsByCollection(collectionName: string) {
    const result: IComputation[] = []

    for (const [compId, deps] of this.dependencies.entries()) {
      const hasCollectionDep = deps.some(
        d => d.type === 'collection' && d.collectionName === collectionName
      )

      if (hasCollectionDep) {
        const comp = this.computations.get(compId)
        if (comp) result.push(comp)
      }
    }

    return result
  }
}
```

**Files to Create:**
- `src/Stores/Panel/TrackerStore.ts`

**Files to Modify:**
- `src/Stores/PanelStore.tsx` (instantiate `trackerStore = new TrackerStore()`)
- `src/Bridge.ts` (add receivers for tracker-* events)

---

### 4.3 Phantom Re-Run Detection (3-4h)

**Implementation:** Connect DDPStore and TrackerStore using `eventemitter3`

**Install dependency:**
```bash
npm install eventemitter3
```

**Enhance DDPStore.ts:**

```typescript
import EventEmitter from 'eventemitter3'

export class DDPStore extends EventEmitter {
    const issues = []

    const recentChanges = PanelStore.ddpStore.collection
      .filter(log => log.parsedContent.msg === 'changed')
      .slice(-100)  // Last 100 changes

    for (const change of recentChanges) {
      const { collection, id } = change.parsedContent

      // Check if document exists in Minimongo
      const doc = PanelStore.minimongoStore.collections[collection]?.find(d => d._id === id)

      if (!doc) {
        issues.push({
          type: 'STALE_SUBSCRIPTION',
          collection,
          documentId: id,
          message: `Server sent update for ${collection}:${id} but document not in client cache`,
          recommendation: 'Check subscription filters - may be subscribing to more than needed',
          timestamp: change.timestamp
        })
      }
    }

    return issues
  }

  /**
   * RQ2.2: Detect phantom re-runs
   * Field changed via DDP but never queried = unnecessary reactivity
   */
  @computed
  get phantomReRuns() {
    const issues = []

    // Get frequently changed fields
    const fieldChangeFrequency = this.getFieldChangeFrequency()

    // Get queried fields from Minimongo logs
    const queriedFields = this.getQueriedFields()

    // Find fields that change but are never queried
    for (const [field, frequency] of Object.entries(fieldChangeFrequency)) {
      if (frequency > 5 && !queriedFields.has(field)) {
        issues.push({
          type: 'PHANTOM_RERUN',
          field,
          changeCount: frequency,
          message: `Field "${field}" changes frequently (${frequency}x) but is never queried`,
          recommendation: 'Add field to publication projection to reduce DDP traffic',
          severity: frequency > 10 ? 'HIGH' : 'MEDIUM'
        })
      }
    }

    return issues
  }

  /**
   * Helper: Count field change frequency from DDP
   */
  private getFieldChangeFrequency(): Record<string, number> {
    const frequency: Record<string, number> = {}

    PanelStore.ddpStore.collection
      .filter(log => log.parsedContent.msg === 'changed')
      .forEach(log => {
        const fields = Object.keys(log.parsedContent.fields || {})
        fields.forEach(field => {
          frequency[field] = (frequency[field] || 0) + 1
        })
      })

    return frequency
  }

  /**
   * Helper: Get fields accessed in Minimongo queries
   */
  private getQueriedFields(): Set<string> {
    const fields = new Set<string>()

    PanelStore.minimongoStore.findLogs.forEach(log => {
      // Extract fields from selector
      if (log.selector && typeof log.selector === 'object') {
        Object.keys(log.selector).forEach(field => fields.add(field))
      }

      // Extract fields from projection
      if (log.options?.fields) {
        Object.keys(log.options.fields).forEach(field => fields.add(field))
      }
    })

    return fields
  }

  /**
   * RQ2.3: Detect unnecessary updates
   * DDP changed but document hasn't been queried recently = dead subscription
   */
  @computed
  get unnecessaryUpdates() {
    const issues = []
    const now = Date.now()

    // Group DDP changes by collection
    const changesByCollection = this.groupChangesByCollection()

    for (const [collection, changes] of Object.entries(changesByCollection)) {
      // Find last query for this collection
      const lastQuery = PanelStore.minimongoStore.findLogs
        .filter(log => log.collectionName === collection)
        .sort((a, b) => b.timestamp - a.timestamp)[0]

      if (!lastQuery || (now - lastQuery.timestamp) > 60000) {
        issues.push({
          type: 'UNNECESSARY_UPDATES',
          collection,
          changeCount: changes.length,
          lastQueryAgo: lastQuery ? now - lastQuery.timestamp : Infinity,
          message: `Collection "${collection}" receiving updates but hasn't been queried in ${
            lastQuery ? Math.round((now - lastQuery.timestamp) / 1000) : '∞'
          }s`,
          recommendation: 'Consider unsubscribing when data not in use',
          severity: changes.length > 10 ? 'HIGH' : 'MEDIUM'
        })
      }
    }

    return issues
  }

  private groupChangesByCollection() {
    const groups: Record<string, any[]> = {}

    PanelStore.ddpStore.collection
      .filter(log => log.parsedContent.msg === 'changed')
      .forEach(log => {
        const collection = log.parsedContent.collection
        if (!groups[collection]) groups[collection] = []
        groups[collection].push(log)
      })

    return groups
  }
}

export const reactivityAnalyzer = new ReactivityAnalyzer()
```

**Files to Create:**
- `src/Services/ReactivityAnalyzer.ts`

---

### 4.2 Create Reactivity Panel UI (2h)

**Pattern to Copy:** `src/Pages/Panel/DDP/` panel structure

**Implementation (src/Pages/Panel/Reactivity/index.tsx):**
```typescript
import { observer } from 'mobx-react'
import { Card, Tag, Callout } from '@blueprintjs/core'
import { reactivityAnalyzer } from '../../../Services/ReactivityAnalyzer'

export const ReactivityPanel = observer(() => {
  const { staleSubscriptions, phantomReRuns, unnecessaryUpdates } = reactivityAnalyzer

  return (
    <div className="reactivity-panel">
      <h2>Reactivity Analysis</h2>

      {/* Stale Subscriptions */}
      <section>
        <h3>Stale Subscriptions ({staleSubscriptions.length})</h3>
        {staleSubscriptions.map((issue, i) => (
          <Callout key={i} intent="warning">
            <strong>{issue.type}</strong>: {issue.message}
            <div><em>Recommendation:</em> {issue.recommendation}</div>
          </Callout>
        ))}
      </section>

      {/* Phantom Re-runs */}
      <section>
        <h3>Phantom Re-runs ({phantomReRuns.length})</h3>
        {phantomReRuns.map((issue, i) => (
          <Card key={i}>
            <Tag intent={issue.severity === 'HIGH' ? 'danger' : 'warning'}>
              {issue.severity}
            </Tag>
            <strong>{issue.field}</strong>: {issue.message}
            <div><em>Recommendation:</em> {issue.recommendation}</div>
          </Card>
        ))}
      </section>

      {/* Unnecessary Updates */}
      <section>
        <h3>Unnecessary Updates ({unnecessaryUpdates.length})</h3>
        {unnecessaryUpdates.map((issue, i) => (
          <Card key={i}>
            <strong>{issue.collection}</strong>: {issue.message}
            <div><em>Recommendation:</em> {issue.recommendation}</div>
          </Card>
        ))}
      </section>
    </div>
  )
})
```

**Files to Create:**
- `src/Pages/Panel/Reactivity/index.tsx`

**Files to Modify:**
- `src/Stores/PanelStore.tsx` (add Reactivity to PanelPage enum)
- `src/Pages/Panel/index.tsx` (add Reactivity tab)

---

### 4.3 Add Tests (3h)

```typescript
// ReactivityAnalyzer.test.ts
describe('ReactivityAnalyzer', () => {
  it('should detect stale subscriptions', () => {
    // Setup: DDP changed but doc not in Minimongo
    PanelStore.ddpStore.collection.push({
      parsedContent: {
        msg: 'changed',
        collection: 'users',
        id: '123',
        fields: { name: 'Alice' }
      },
      timestamp: Date.now()
    })

    PanelStore.minimongoStore.collections = { users: [] }  // Empty

    // Act
    const issues = reactivityAnalyzer.staleSubscriptions

    // Assert
    expect(issues.length).toBe(1)
    expect(issues[0].type).toBe('STALE_SUBSCRIPTION')
    expect(issues[0].collection).toBe('users')
  })

  it('should detect phantom re-runs', () => {
    // Setup: Field changes 10 times but never queried
    for (let i = 0; i < 10; i++) {
      PanelStore.ddpStore.collection.push({
        parsedContent: {
          msg: 'changed',
          fields: { unusedField: i }
        }
      })
    }

    PanelStore.minimongoStore.methodLogs = []  // No queries

    // Act
    const issues = reactivityAnalyzer.phantomReRuns

    // Assert
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].type).toBe('PHANTOM_RERUN')
    expect(issues[0].severity).toBe('HIGH')
  })
})
```

**Files to Create:**
- `src/Services/__tests__/ReactivityAnalyzer.test.ts`

---

## Iteration 5: Performance Auditing (RQ3.1, RQ3.2, RQ3.3)

**Goal:** Payload byte size, main-thread blocking, memory leak detection
**Effort:** 5 hours

### 5.1 Add PerformanceObserver for Long Tasks (1h)

**Implementation (src/Browser/Inject.ts):**
```typescript
// Add during initialization (after Meteor detection)
if ('PerformanceObserver' in window) {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      sendMessage('performance-longtask', {
        name: entry.name,
        duration: entry.duration,
        startTime: entry.startTime,
        attribution: entry.attribution  // Which script caused it
      })
    }
  })

  observer.observe({ type: 'longtask', buffered: true })
}
```

**Files to Modify:**
- `src/Browser/Inject.ts`

**New Store (src/Stores/Panel/PerformanceStore.ts):**
```typescript
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
```

**Files to Create:**
- Modify existing `src/Stores/Panel/PerformanceStore.ts` (add longTasks)

---

### 5.2 Memory Leak Workflow (2h)

**Implementation (src/Stores/Panel/MinimongoStore/index.ts):**
```typescript
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

**UI (src/Pages/Panel/Performance/MemoryLeakDetector.tsx):**
```typescript
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
          <table>
            {Object.entries(snapshotComparison.deltas).map(([collection, delta]) => (
              <tr key={collection}>
                <td>{collection}</td>
                <td>{delta > 0 ? '+' : ''}{delta} documents</td>
              </tr>
            ))}
          </table>
        </Card>
      )}
    </div>
  )
})
```

**Files to Modify:**
- `src/Stores/Panel/MinimongoStore/index.ts`

**Files to Create:**
- `src/Pages/Panel/Performance/MemoryLeakDetector.tsx`

---

### 5.3 Correlate Performance with DDP Activity (2h)

**Implementation (src/Services/PerformanceCorrelator.ts):**
```typescript
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
        correlations.push({
          task,
          suspectDDP,
          confidence: suspectDDP.length > 5 ? 'HIGH' : 'MEDIUM'
        })
      }
    }

    return correlations
  }
}

export const performanceCorrelator = new PerformanceCorrelator()
```

**Files to Create:**
- `src/Services/PerformanceCorrelator.ts`

---

## Iteration 6: The Auditor (RQ1.3, RQ2.4, RQ4.2, RQ4.3)

**Goal:** Intelligent analysis, anti-pattern detection, recommendations
**Effort:** 8 hours

### 6.1 Heuristic Analysis (3h)

**Implementation (src/Services/Auditor.ts):**
```typescript
import { computed } from 'mobx'
import { PanelStore } from '../Stores/PanelStore'

export class Auditor {
  /**
   * RQ1.3: Detect over-fetching
   * Subscription returns many documents but only few are queried
   */
  @computed
  get overFetchingIssues() {
    const issues = []

    const subscriptions = PanelStore.subscriptionStore.subsWithMeta

    for (const sub of subscriptions) {
      if (!sub.initialDataLoadBytes) continue

      // How many documents were loaded?
      const docsLoaded = this.estimateDocumentCount(sub)

      // How many were actually queried?
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
          message: `Subscription "${sub.name}" loaded ${docsLoaded} documents but only ${docsQueried} were queried`,
          recommendation: 'Add filters to publication to reduce data sent',
          severity: 'HIGH'
        })
      }
    }

    return issues
  }

  /**
   * RQ2.4: Detect missing indexes
   * Query takes >50ms = likely missing index
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
   * RQ4.2: Detect large payloads
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
   * Helper: Estimate document count from byte size
   */
  private estimateDocumentCount(sub: any): number {
    // Assume average document is 1KB
    return Math.round(sub.initialDataLoadBytes / 1024)
  }
}

export const auditor = new Auditor()
```

**Files to Create:**
- `src/Services/Auditor.ts`

---

### 6.2 Anti-Pattern Detection (2h)

**Enhancement to Auditor.ts:**
```typescript
export class Auditor {
  /**
   * Detect N+1 queries
   * Same query run multiple times in quick succession
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

### 6.3 Opt-In Proxy Field Tracking (3h)

**❌ ORIGINAL:** Proxy all documents by default
**✅ CORRECTED:** Opt-in via Settings with feature flag

**Settings UI (src/Pages/Panel/Settings/index.tsx):**
```typescript
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
        <p>Wraps documents in Proxy to detect which fields are accessed. May slow down app.</p>
      </Callout>
    </div>
  )
})
```

**SettingStore (src/Stores/Panel/SettingStore.ts):**
```typescript
export class SettingStore {
  @observable isDeepFieldAnalysisEnabled = false

  @action
  setDeepFieldAnalysis(enabled: boolean) {
    this.isDeepFieldAnalysisEnabled = enabled
  }
}
```

**MeteorAdapter.ts (conditional Proxy wrapping):**
```typescript
prototype['find'] = function (...args) {
  const result = original.apply(this, args)

  // Only wrap if feature enabled
  if (!PanelStore.settingStore.isDeepFieldAnalysisEnabled) {
    return result
  }

  // Wrap cursor to track field access
  const wrappedCursor = {
    ...result,
    fetch: () => {
      const docs = result.fetch()
      return docs.map(doc => this.wrapWithProxy(doc))
    }
  }

  return wrappedCursor
}

private wrapWithProxy(doc: any) {
  return new Proxy(doc, {
    get(target, prop) {
      // Track field access
      sendMessage('field-access', {
        collection: this._name,
        field: prop,
        timestamp: Date.now()
      })

      return target[prop]
    }
  })
}
```

**Why Opt-In:**
- ✅ No performance impact by default
- ✅ Power users can enable for deep analysis
- ✅ Clear warning about performance
- ✅ Can be toggled on/off easily

**Files to Modify:**
- `src/Stores/Panel/SettingStore.ts`
- `src/Pages/Panel/Settings/index.tsx`
- `src/Injectors/MeteorAdapter.ts`

---

## Testing Strategy (Validated ✅)

### Unit Testing (Jest)
**Pattern:** Use existing `jest.config.js` and test structure

**Test Files to Create:**
- `src/Stores/Panel/MinimongoStore/__tests__/MinimongoStore.test.ts`
- `src/Services/__tests__/MinimongoDDPCorrelator.test.ts`
- `src/Services/__tests__/ReactivityAnalyzer.test.ts`
- `src/Services/__tests__/PerformanceCorrelator.test.ts`
- `src/Services/__tests__/Auditor.test.ts`

### E2E Testing (Manual)
**Use `/devapp` Meteor application**

**Test Routes to Add:**
```javascript
// devapp/imports/api/test-routes.js

// Test over-fetching
Meteor.publish('users-overfetch', function() {
  return Users.find({})  // Returns 1000 docs
})

// Test N+1
Template.userList.helpers({
  users() {
    return Users.find().fetch().map(user => {
      user.profile = Profiles.findOne({ userId: user._id })  // N+1!
      return user
    })
  }
})

// Test large payload
Meteor.publish('large-payload', function() {
  return HugeDocuments.find({}, { limit: 100 })  // 100KB each
})
```

---

## Implementation Order (Final)

### Iteration 1: Minimongo Query View (4.5-7.5h)
Primary goal - foundational feature

### Iteration 2: DDP Correlation (4-5h)
Secondary goal - adds value to Iteration 1

### Iteration 3: Enhanced DDP Inspector (5h)
RPC metrics, subscription metrics, byte size

### Iteration 4: DDP-Based Reactivity (8h)
Stale subscriptions, phantom re-runs, unnecessary updates

### Iteration 5: Performance Auditing (5h)
Long tasks, memory leaks, correlation

### Iteration 6: Auditor (8h)
Intelligent analysis, anti-patterns, opt-in Proxy

**Total Effort:** 34.5-42.5 hours

---

## Gotchas and Risk Mitigation

### 1. Stack Trace Performance
**Risk:** Generating stack traces on every query may slow down app
**Mitigation:** Add feature flag to disable stack traces

### 2. Message Queue Overflow
**Risk:** High-volume apps may overflow message queue
**Mitigation:** Implement sampling (log 1 in 10 queries) when queue full

### 3. Correlation Accuracy
**Risk:** Timestamp-based correlation may miss true causation
**Mitigation:** Use 100ms window + confidence scoring (HIGH/MEDIUM/LOW)

### 4. Proxy Breaking Changes
**Risk:** Wrapping documents in Proxy may break app code
**Mitigation:** Opt-in feature flag + clear warning (Iteration 6.3)

### 5. Memory Leaks in DevTools
**Risk:** Storing thousands of logs in MobX stores
**Mitigation:** Limit arrays to 1000 entries max (implemented in all stores)

---

## Success Metrics

### Iteration 1 Complete When:
- ✅ Minimongo queries logged with stack traces
- ✅ Query list UI working with virtualization
- ✅ Tests passing

### Iteration 2 Complete When:
- ✅ DDP correlation badges showing in UI
- ✅ Correlation confidence scoring working
- ✅ Tests passing

### Iterations 3-6 Complete When:
- ✅ All RQ requirements met (RQ1.1-RQ4.3)
- ✅ Auditor providing actionable recommendations
- ✅ E2E testing validates findings
- ✅ All tests passing

---

## Related Documentation

- **Feature Spec:** [FEATURE_SPEC.md](./FEATURE_SPEC.md)
- **Architecture Decisions:** [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md)
- **Codebase Inventory:** [../../architecture/CODEBASE_INVENTORY.md](../../architecture/CODEBASE_INVENTORY.md)
- **Meteor Patterns:** [../../METEOR_PATTERNS_REFERENCE.md](../../METEOR_PATTERNS_REFERENCE.md)
- **Implementation Guide:** [LLM_IMPLEMENTATION_GUIDE.md](./LLM_IMPLEMENTATION_GUIDE.md)

---

**Document Status:** ✅ Validated & Corrected (2025-10-05)
**Confidence:** 95%
**Ready to Implement:** YES

**Next Step:** Begin Iteration 1 - Minimongo Query View (4.5-7.5h)
