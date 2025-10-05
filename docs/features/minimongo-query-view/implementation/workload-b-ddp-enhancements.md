# Workload B: DDP Inspector Enhancements

**Owner:** Dev B
**Effort:** 5-6 hours (Iteration 3)
**Dependencies:** None - can start immediately (START THIS FIRST!)
**Outputs:** RPC latency metrics, subscription data load tracking, byte size calculation, EventEmitter integration

---

## Overview

This workload enhances the existing DDP panel with performance metrics. It's **fully independent** and should **start first** because other workloads (C, D) depend on the EventEmitter integration.

**Why start first?** Workload C (Tracker) needs `DDPStore` to extend `EventEmitter` for phantom re-run detection.

---

## Task 1: Add RPC Latency Metrics to DDPStore (2h)

### Goal

Track "Time to Result" vs "Time to Ready" for RPC method calls, making latency compensation visible.

### Pattern to Copy

Existing `DDPStore.getSubscriptionInit/Ready` correlation methods (proven pattern).

### Implementation

```typescript
// src/Stores/Panel/DDPStore.ts
import { observable, action, computed, makeObservable } from 'mobx'
import EventEmitter from 'eventemitter3'  // ← NEW

export class DDPStore extends EventEmitter {  // ← EXTEND EventEmitter
  @observable collection: DDPLog[] = []

  constructor() {
    super()  // ← Initialize EventEmitter
    makeObservable(this)
  }

  // NEW: Computed filters (instead of Map for consistency)
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
    const updatedLog = this.getMethodUpdated(methodId)

    if (!methodLog || !resultLog) return null

    return {
      timeToResult: resultLog.timestamp - methodLog.timestamp,
      timeToReady: updatedLog ? (updatedLog.timestamp - methodLog.timestamp) : null,
      methodName: methodLog.parsedContent.method,
      params: methodLog.parsedContent.params
    }
  }

  // MODIFY: Emit events when DDP 'changed' arrives (for Workload C)
  @action
  addLog(log: DDPLog) {
    this.collection.push(log)

    // Emit event for Tracker reactivity analysis (Workload C depends on this)
    if (log.parsedContent.msg === 'changed') {
      this.emit('ddp-changed', {
        docId: log.parsedContent.id,
        collection: log.parsedContent.collection,
        fields: Object.keys(log.parsedContent.fields || {})
      })
    }
  }
}
```

**Why `@computed` instead of `Map`?**
- ✅ Matches existing `getSubscriptionInit/Ready` pattern
- ✅ No memory leak risk (no manual cleanup needed)
- ✅ Reactive via MobX
- ✅ Consistent with codebase style

### UI Enhancement: Timeline Visualization

**Task:** Add mini-timeline to `DDPLogPreview.tsx` showing RPC latency visually.

```typescript
// src/Pages/Panel/DDP/components/DDPLogPreview.tsx
export const DDPLogPreview = observer(({ log }: DDPLogPreviewProps) => {
  const latency = PanelStore.ddpStore.getMethodLatency(log.parsedContent.id)

  return (
    <div>
      {/* Existing content... */}

      {/* NEW: RPC Timeline */}
      {latency && (
        <div className="rpc-timeline">
          <div className="timeline-bar">
            <span className="method-start">method</span>
            <span className="arrow">→</span>
            <span className="result-marker" title="Server computed result">
              result ({latency.timeToResult.toFixed(2)}ms)
            </span>
            {latency.timeToReady && (
              <>
                <span className="arrow">→</span>
                <span className="ready-marker" title="All data side-effects sent">
                  ready ({latency.timeToReady.toFixed(2)}ms total)
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
```

**Gotcha:** Developers often mistake "Time to Result" for total user-perceived latency. An unblocked method can return instantly, but the UI won't update until all data changes arrive (the `updated` message). The timeline visualization makes latency compensation immediately obvious.

### Install Dependency

```bash
npm install eventemitter3
```

### Files Modified
- `src/Stores/Panel/DDPStore.ts`
- `src/Pages/Panel/DDP/components/DDPLogPreview.tsx`
- `package.json` (add eventemitter3)

---

## Task 2: Add Subscription Data Load Tracking (2h)

### Goal

Track initial data load metrics + ongoing update rate for subscriptions.

### Pattern to Copy

`SubscriptionStore.subsWithMeta` (PROVEN IN PRODUCTION - correlation pattern already works).

### Implementation

```typescript
// src/Stores/Panel/SubscriptionStore.ts
interface ISubscription {
  id: string
  name: string
  params: any[]
  // NEW:
  startTime?: number
  readyTime?: number
  initialDataLoadBytes?: number
  updateRate?: number  // messages/minute
  totalUpdateVolume?: number  // total bytes from updates
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

  // NEW: Calculate data load + update metrics
  getDataLoadMetrics(sub: ISubscription) {
    const initLog = PanelStore.ddpStore.getSubscriptionInit(sub)
    const readyLog = PanelStore.ddpStore.getSubscriptionReady(sub)

    if (!initLog || !readyLog) return {}

    // Find all 'added' messages between init and ready (initial load)
    const addedMessages = PanelStore.ddpStore.collection.filter(log =>
      log.parsedContent.msg === 'added' &&
      log.timestamp >= initLog.timestamp &&
      log.timestamp <= readyLog.timestamp
    )

    // Sum byte sizes for initial load
    const totalBytes = addedMessages.reduce((sum, log) => {
      const byteSize = log.byteSize || new TextEncoder().encode(JSON.stringify(log.parsedContent)).length
      return sum + byteSize
    }, 0)

    // Calculate update metrics (ongoing updates AFTER ready)
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
      const byteSize = log.byteSize || new TextEncoder().encode(JSON.stringify(log.parsedContent)).length
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

### UI Enhancement: New Columns

**Task:** Add 3 new sortable columns to subscription list.

```typescript
// src/Pages/Panel/Subscriptions/Subscriptions.tsx
export const Subscriptions = observer(() => {
  return (
    <HTMLTable>
      <thead>
        <tr>
          <th>Name</th>
          <th>Status</th>
          {/* NEW COLUMNS */}
          <th>Ready Time</th>
          <th>Initial Load</th>
          <th>Update Rate</th>
        </tr>
      </thead>
      <tbody>
        {PanelStore.subscriptionStore.subsWithMeta.map(sub => (
          <tr key={sub.id}>
            <td>{sub.name}</td>
            <td>{sub.status}</td>
            {/* NEW CELLS */}
            <td>{sub.readyTime ? `${(sub.readyTime - sub.startTime)}ms` : '-'}</td>
            <td>{sub.initialDataLoadBytes ? formatBytes(sub.initialDataLoadBytes) : '-'}</td>
            <td>{sub.updateRate ? `${sub.updateRate.toFixed(1)}/min` : '-'}</td>
          </tr>
        ))}
      </tbody>
    </HTMLTable>
  )
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
```

This allows developers to instantly identify:
1. Which subscriptions are slowest to load (Ready Time)
2. Which subscriptions dump the most data initially (Initial Load)
3. Which subscriptions are "chatty" (Update Rate)

**Gotcha:** A "chatty" subscription that sends frequent, small updates can be just as damaging as a single large one, especially on high-latency mobile networks. The Update Rate metric makes this visible.

### Files Modified
- `src/Stores/Panel/SubscriptionStore.ts`
- `src/Pages/Panel/Subscriptions/Subscriptions.tsx`

---

## Task 3: Add Byte Size Calculation in DDPInjector (1h)

### Goal

Calculate true UTF-8 byte size for all DDP messages.

### Implementation

```typescript
// src/Injectors/DDPInjector.ts
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

  return originalSend.call(this, data)
}

// Same for receive
WebSocket.prototype.addEventListener = function (event, handler) {
  if (event === 'message') {
    const wrappedHandler = (e) => {
      const byteSize = new TextEncoder().encode(e.data).length

      sendMessage('ddp-event', {
        direction: 'received',
        message: JSON.parse(e.data),
        timestamp: Date.now(),
        byteSize  // ← ADD THIS
      })

      handler(e)
    }

    return originalAddEventListener.call(this, event, wrappedHandler)
  }

  return originalAddEventListener.call(this, event, handler)
}
```

### Update Interface

```typescript
// src/Stores/Panel/DDPStore.ts (add to interface)
interface IDDPLog {
  direction: 'sent' | 'received'
  message: any
  parsedContent: any
  timestamp: number
  byteSize?: number  // ← NEW
  trace?: any[]
}
```

### Files Modified
- `src/Injectors/DDPInjector.ts`
- `src/Stores/Panel/DDPStore.ts` (update IDDPLog interface)

---

## Integration Checklist

**Complete When:**
- ✅ DDPStore extends EventEmitter
- ✅ `ddp-changed` events emitted
- ✅ RPC latency timeline renders in UI
- ✅ Subscription list shows 3 new columns
- ✅ Byte sizes tracked for all DDP messages

**Critical Handoff:**
- ✅ `DDPStore.emit('ddp-changed', ...)` enables Workload C (Tracker phantom re-run detection)
- ✅ Byte sizes enable Workload D (Performance correlation)

---

## Files Summary

**Modified (4 files):**
1. `src/Stores/Panel/DDPStore.ts` (EventEmitter + RPC methods)
2. `src/Pages/Panel/DDP/components/DDPLogPreview.tsx` (timeline UI)
3. `src/Stores/Panel/SubscriptionStore.ts` (data load metrics)
4. `src/Pages/Panel/Subscriptions/Subscriptions.tsx` (new columns)
5. `src/Injectors/DDPInjector.ts` (byte size calculation)

**Dependencies Added:**
- `eventemitter3` (npm package)

**Total LOC:** ~250 lines of new code

---

## Testing Notes

**Manual E2E Testing:**

Use `/devapp` to test:

```javascript
// Test RPC latency
Meteor.call('slowMethod', (err, result) => {
  // Check timeline shows "result" and "ready" separately
})

// Test chatty subscription
Meteor.publish('chattyPosts', function() {
  const handle = Posts.find().observe({
    changed(doc) {
      this.changed('posts', doc._id, doc)  // Triggers frequently
    }
  })

  return handle
})

// Check Update Rate column updates in real-time
```

**Unit Tests:**

Focus on `getMethodLatency()` and `getDataLoadMetrics()` methods:

```typescript
describe('DDPStore', () => {
  it('should calculate RPC latency', () => {
    const store = new DDPStore()

    store.collection.push({
      parsedContent: { msg: 'method', id: '1', method: 'test' },
      timestamp: 1000
    })

    store.collection.push({
      parsedContent: { msg: 'result', id: '1' },
      timestamp: 1050
    })

    const latency = store.getMethodLatency('1')

    expect(latency.timeToResult).toBe(50)
  })
})
```
