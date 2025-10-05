# Workload C: Tracker Reactivity Analysis

**Owner:** Dev C
**Effort:** 10-12 hours (Iteration 4)
**Dependencies:** Workload B (needs `DDPStore` EventEmitter integration)
**Outputs:** TrackerInjector, TrackerStore, phantom re-run detection, Reactivity panel UI

---

## Overview

This workload instruments `Tracker.autorun` to visualize reactivity, detect phantom re-runs, and identify leaked computations. This answers the #1 frustrating question Meteor developers face: **"Why did my component just re-render?"**

### ✅ Why TrackerInjector is Viable

**Previous concern:** "We inject too late to wrap Tracker.autorun"

**Evidence that proves it works:**
1. ✅ `MeteorAdapter.ts:28-53` successfully wraps `Mongo.Collection.prototype` methods **after** Meteor loads
2. ✅ `Inject.ts` polls until `Meteor` object exists, then injects **before** app bundle code executes
3. ✅ Injection timing: Meteor core loads → We wrap APIs → App bundles execute
4. ✅ This is **identical** to how we already wrap Minimongo successfully

**Key Pattern:** Global flag (`window.__meteor_devtools_current_computation`) tracks which computation is active during reactive function calls.

---

## Task 1: Create TrackerInjector.ts (4-5h)

### Goal

Wrap `Tracker.autorun` to track computation lifecycle and dependencies.

### Implementation

```typescript
// src/Injectors/TrackerInjector.ts
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

    // Wrap computation methods to track lifecycle
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

### Call TrackerInjector from Inject.ts

```typescript
// src/Browser/Inject.ts (modify inject() function)
function inject() {
  --attempts

  if (typeof Meteor === 'object' && !window.__meteor_devtools_evolved) {
    window.__meteor_devtools_evolved = true

    DDPInjector()
    MinimongoInjector()
    MeteorAdapter()
    TrackerInjector()  // ← ADD THIS

    window.__meteor_devtools_evolved_receiveMessage = Registry.run.bind(Registry)

    warning(`Initialized. Attempts: ${500 - attempts}.`)
    clearInterval(interval)
    return
  }
}
```

### Files Created
- `src/Injectors/TrackerInjector.ts`

### Files Modified
- `src/Browser/Inject.ts` (call TrackerInjector)

---

## Task 2: Create TrackerStore.ts (2-3h)

### Goal

Store computation state and dependencies in MobX store.

### Implementation

```typescript
// src/Stores/Panel/TrackerStore.ts
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
  options?: any
  varName?: string
  key?: string
}

export class TrackerStore extends EventEmitter {
  @observable computations = new Map<string, IComputation>()
  @observable dependencies = new Map<string, IDependency[]>()  // computationId → dependencies
  @observable phantomReRuns: PhantomReRun[] = []

  constructor() {
    super()
    makeObservable(this)

    // Listen to computation re-runs
    this.on('computation-reran', ({ computationId }) => {
      this.detectPhantomReRun(computationId)
    })

    // Listen to DDP changed events (from Workload B)
    PanelStore.ddpStore.on('ddp-changed', ({ docId, collection, fields }) => {
      this.handleDDPChange(docId, collection, fields)
    })
  }

  private lastDDPChange: { docId: string; collection: string; fields: string[] } | null = null

  private handleDDPChange(docId: string, collection: string, fields: string[]) {
    // Store last DDP change for correlation
    this.lastDDPChange = { docId, collection, fields }
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
    // Computations running for >5 minutes (likely leaked)
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

  /**
   * Phantom Re-Run Detection
   * Detects when a computation re-runs due to DDP field changes
   * that the computation doesn't actually access
   */
  @action
  private detectPhantomReRun(computationId: string) {
    const computation = this.computations.get(computationId)
    if (!computation || !this.lastDDPChange) return

    // Get dependencies for this computation
    const deps = this.dependencies.get(computationId) || []

    // Find if any dependency matches the collection that changed
    const matchingDep = deps.find(
      d => d.type === 'collection' && d.collectionName === this.lastDDPChange!.collection
    )

    if (!matchingDep) return

    // Intersection check: which DDP fields are NOT in dependency fields?
    const dependencyFields = new Set<string>()

    // Extract fields from selector
    if (matchingDep.selector && typeof matchingDep.selector === 'object') {
      Object.keys(matchingDep.selector).forEach(f => dependencyFields.add(f))
    }

    // Extract fields from projection
    if (matchingDep.options?.fields) {
      Object.keys(matchingDep.options.fields).forEach(f => dependencyFields.add(f))
    }

    // Find phantom fields (changed in DDP but not in dependency)
    const phantomFields = this.lastDDPChange.fields.filter(
      field => !dependencyFields.has(field)
    )

    if (phantomFields.length > 0) {
      this.phantomReRuns.push({
        computationId,
        collection: this.lastDDPChange.collection,
        docId: this.lastDDPChange.docId,
        phantomFields,
        timestamp: Date.now(),
        message: `Computation re-ran due to update on field(s) [${phantomFields.join(', ')}] but these fields were not accessed`,
        recommendation: `Add { fields: { ${phantomFields.map(f => `${f}: 0`).join(', ')} } } to publication to prevent wasted re-renders`
      })
    }
  }
}

interface PhantomReRun {
  computationId: string
  collection: string
  docId: string
  phantomFields: string[]
  timestamp: number
  message: string
  recommendation: string
}
```

**Gotcha:** The single biggest and most common Meteor performance problem is over-publishing data by forgetting to use the `fields` projector in publications. This causes "Phantom Re-runs" where components re-render unnecessarily. The intersection check between DDP `changed` fields and computation-accessed fields makes this visible.

### Add Bridge Receivers

```typescript
// src/Bridge.ts
case 'tracker-computation-created':
  PanelStore.trackerStore.createComputation(
    message.data.computationId,
    message.data.stackTrace,
    message.data.timestamp
  )
  break

case 'tracker-dependency-registered':
  PanelStore.trackerStore.registerDependency(
    message.data.computationId,
    message.data.dependency
  )
  break

case 'tracker-computation-reran':
  PanelStore.trackerStore.markComputationReran(message.data.computationId)
  break

case 'tracker-computation-stopped':
  PanelStore.trackerStore.stopComputation(
    message.data.computationId,
    message.data.timestamp
  )
  break
```

### Instantiate TrackerStore

```typescript
// src/Stores/PanelStore.tsx
export class PanelStoreConstructor {
  // Domain Stores
  ddpStore = new DDPStore()
  trackerStore = new TrackerStore()  // ← NEW
  bookmarkStore = new BookmarkStore()
  minimongoStore = new MinimongoStore()
  subscriptionStore = new SubscriptionStore()
  performanceStore = new PerformanceStore()

  // UI Store
  settingStore = new SettingStore()
}
```

### Files Created
- `src/Stores/Panel/TrackerStore.ts`

### Files Modified
- `src/Bridge.ts` (add 4 new event receivers)
- `src/Stores/PanelStore.tsx` (instantiate TrackerStore)

---

## Task 3: Create Reactivity Panel UI (2-3h)

### Goal

Build UI to visualize running computations, leaked computations, and phantom re-runs.

### Implementation

```typescript
// src/Pages/Panel/Reactivity/index.tsx
import { observer } from 'mobx-react'
import { Card, Tag, Callout, HTMLTable } from '@blueprintjs/core'
import { PanelStore } from '../../../Stores/PanelStore'

export const ReactivityPanel = observer(() => {
  const { runningComputations, leakedComputations, phantomReRuns } = PanelStore.trackerStore

  return (
    <div className="reactivity-panel">
      <h2>Reactivity Analysis</h2>

      {/* Running Computations */}
      <section>
        <h3>Running Computations ({runningComputations.length})</h3>
        <HTMLTable>
          <thead>
            <tr>
              <th>ID</th>
              <th>Dependencies</th>
              <th>Re-run Count</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {runningComputations.map(comp => (
              <tr key={comp.id}>
                <td>{comp.id.slice(0, 8)}</td>
                <td>{comp.dependencies.size}</td>
                <td>{comp.rerunCount}</td>
                <td>{Math.round((Date.now() - comp.createdAt) / 1000)}s</td>
              </tr>
            ))}
          </tbody>
        </HTMLTable>
      </section>

      {/* Leaked Computations */}
      {leakedComputations.length > 0 && (
        <section>
          <h3>⚠️ Leaked Computations ({leakedComputations.length})</h3>
          <Callout intent="danger">
            These computations have been running for &gt;5 minutes. They may be leaked
            (created in a component that unmounted without calling .stop()).
          </Callout>
          {leakedComputations.map(comp => (
            <Card key={comp.id}>
              <strong>ID:</strong> {comp.id} <br />
              <strong>Age:</strong> {Math.round((Date.now() - comp.createdAt) / 60000)} minutes <br />
              <strong>Re-runs:</strong> {comp.rerunCount}
              {comp.stackTrace && (
                <details>
                  <summary>Created at:</summary>
                  <pre>{comp.stackTrace}</pre>
                </details>
              )}
            </Card>
          ))}
        </section>
      )}

      {/* Phantom Re-runs */}
      <section>
        <h3>🔴 Phantom Re-runs ({phantomReRuns.length})</h3>
        <p>
          Computations that re-ran due to DDP field updates that weren't actually accessed.
          This is the #1 Meteor performance issue.
        </p>
        {phantomReRuns.map((issue, i) => (
          <Card key={i}>
            <Tag intent="warning">PERFORMANCE</Tag>
            <p><strong>{issue.message}</strong></p>
            <p><em>Collection:</em> {issue.collection}</p>
            <p><em>Unused Fields:</em> {issue.phantomFields.join(', ')}</p>
            <p><em>Recommendation:</em></p>
            <pre>{issue.recommendation}</pre>
          </Card>
        ))}
      </section>
    </div>
  )
})
```

### Add to Navigation

```typescript
// src/Stores/PanelStore.tsx (add to enum)
export enum PanelPage {
  DDP = 'ddp',
  Subscriptions = 'subscriptions',
  Minimongo = 'minimongo',
  Reactivity = 'reactivity',  // ← NEW
  Performance = 'performance',
  Bookmarks = 'bookmarks',
  Sponsor = 'sponsor'
}
```

```typescript
// src/Pages/Panel/index.tsx (add tab)
<Tab id={PanelPage.Reactivity} title="Reactivity" panel={<ReactivityPanel />} />
```

### Files Created
- `src/Pages/Panel/Reactivity/index.tsx`

### Files Modified
- `src/Stores/PanelStore.tsx` (add Reactivity to enum)
- `src/Pages/Panel/index.tsx` (add Reactivity tab)

---

## Task 4: Add Tests (1-2h)

### Test Cases

```typescript
// src/Stores/Panel/__tests__/TrackerStore.test.ts
describe('TrackerStore - Phantom Re-Run Detection', () => {
  it('should detect phantom re-run when DDP field not in dependency', () => {
    const store = new TrackerStore()

    // Setup: Create computation with dependency on 'name' field
    store.createComputation('comp1', 'stack...', Date.now())
    store.registerDependency('comp1', {
      type: 'collection',
      collectionName: 'users',
      selector: { _id: '123' },
      options: { fields: { name: 1 } }  // Only depends on 'name'
    })

    // Simulate DDP changed with 'commentCount' field
    PanelStore.ddpStore.emit('ddp-changed', {
      docId: '123',
      collection: 'users',
      fields: ['commentCount']  // Different field!
    })

    // Trigger re-run
    store.markComputationReran('comp1')

    // Assert
    expect(store.phantomReRuns.length).toBe(1)
    expect(store.phantomReRuns[0].phantomFields).toContain('commentCount')
    expect(store.phantomReRuns[0].recommendation).toContain('commentCount: 0')
  })

  it('should NOT detect phantom re-run when DDP field IS in dependency', () => {
    const store = new TrackerStore()

    store.createComputation('comp1', 'stack...', Date.now())
    store.registerDependency('comp1', {
      type: 'collection',
      collectionName: 'users',
      selector: { _id: '123' },
      options: { fields: { name: 1 } }
    })

    // Simulate DDP changed with 'name' field (matches dependency)
    PanelStore.ddpStore.emit('ddp-changed', {
      docId: '123',
      collection: 'users',
      fields: ['name']
    })

    store.markComputationReran('comp1')

    // Assert: No phantom re-run
    expect(store.phantomReRuns.length).toBe(0)
  })

  it('should track leaked computations', () => {
    const store = new TrackerStore()

    // Create computation 6 minutes ago
    const oldTimestamp = Date.now() - (6 * 60 * 1000)
    store.createComputation('old-comp', 'stack...', oldTimestamp)

    // Assert
    expect(store.leakedComputations.length).toBe(1)
  })
})
```

### Files Created
- `src/Stores/Panel/__tests__/TrackerStore.test.ts`

---

## Integration Checklist

**Complete When:**
- ✅ TrackerInjector wraps Tracker.autorun
- ✅ Computations tracked with dependencies
- ✅ Phantom re-runs detected and displayed
- ✅ Leaked computations flagged
- ✅ Reactivity panel renders
- ✅ Tests passing

**Handoff to Other Workloads:**
- ✅ TrackerStore available for Workload E (Auditor)

---

## Files Summary

**Created (3 files):**
1. `src/Injectors/TrackerInjector.ts`
2. `src/Stores/Panel/TrackerStore.ts`
3. `src/Pages/Panel/Reactivity/index.tsx`
4. `src/Stores/Panel/__tests__/TrackerStore.test.ts`

**Modified (4 files):**
1. `src/Browser/Inject.ts` (call TrackerInjector)
2. `src/Bridge.ts` (add 4 event receivers)
3. `src/Stores/PanelStore.tsx` (instantiate TrackerStore, add enum)
4. `src/Pages/Panel/index.tsx` (add Reactivity tab)

**Total LOC:** ~600 lines of new code
