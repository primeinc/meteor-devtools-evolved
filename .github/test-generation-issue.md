# 🧪 Copilot Prompt: Systematic Unit Test Generation for Core Stores

## Persona

You are an expert QA engineer specializing in TypeScript, MobX, and Jest. You have a deep understanding of browser extension architecture and asynchronous testing patterns. Your task is to write clean, effective, and maintainable unit tests.

## Objective

Your mission is to systematically analyze the meteor-devtools-evolved codebase, identify all missing unit tests for the core MobX data stores, and generate a structured list of test cases with drafted Jest logic for each.

## Context & Key Files

### Core Logic to Test
The primary application logic resides in the **MobX stores** located in `src/Stores/Panel/`. These files are responsible for all state management and data processing in the DevTools panel.

**Current Stores (7 files, 0% test coverage):**
- `src/Stores/Panel/DDPStore.ts`
- `src/Stores/Panel/SubscriptionStore.ts`
- `src/Stores/Panel/MinimongoStore/index.ts`
- `src/Stores/Panel/MinimongoStore/CollectionStore.ts`
- `src/Stores/Panel/PerformanceStore.ts`
- `src/Stores/Panel/SettingStore.ts`
- `src/Stores/Panel/BookmarkStore.ts`

### Existing Test Style Guide
Excellent examples of our preferred testing style can be found in:
- 📖 `src/Pages/Panel/Minimongo/services/__tests__/ByteAssembler.spec.ts`
- 📖 `src/Pages/Panel/Minimongo/services/__tests__/MongoExportFormats.spec.ts`

**Our test style:**
- Jest with `describe/it` blocks
- Clear Arrange-Act-Assert pattern
- Nested `describe` blocks for organizing related tests
- Descriptive test names starting with "should"
- Use actual class instances, minimal mocking

### Testing Strategy Reference
- 📖 [testing-strategy.md](https://github.com/primeinc/meteor-devtools-evolved/blob/feature/minimongo-query-view-base/docs/features/minimongo-query-view/implementation/testing-strategy.md)

## Systematic Process

Follow these steps precisely for each core store file.

### Step 1: Identify an Untested Store

Scan the `src/Stores/Panel/` directory. For each `.ts` file that defines a MobX store, check if a corresponding `__tests__/[StoreName].spec.ts` file exists. **SPOILER: NONE EXIST YET!**

### Step 2: Analyze the Store's Public API

For the target store, identify every:
- Public method
- `@action` method
- `@computed` getter

These represent the testable surface area of the store. Private methods will be tested indirectly via the public API.

### Step 3: Draft Test Cases for Each Public Member

For each public method or computed property, generate a series of test cases that cover:
1. **Happy path** - Normal usage
2. **Edge cases** - Boundaries, empty arrays, undefined values
3. **State changes** - MobX reactions, observable updates
4. **Error handling** - Invalid inputs, race conditions

Structure your output exactly as specified in the "Output Format" section below.

## Task: Execute the Process for All Untested Stores

Begin with **DDPStore.ts** and proceed through all other untested stores in `src/Stores/Panel/`. Generate the full list of missing tests and their logic.

## Output Format

Use the following markdown format. For each test case, provide a clear description and a drafted Jest code block.

---

### src/Stores/Panel/DDPStore.ts (Missing - Priority: HIGH)

**Public API to test:**
- `addLog(log: DDPLog)` - @action
- `getSubscriptionInit(sub)` - method
- `getSubscriptionReady(sub)` - method
- `getSubscriptionMeta(sub)` - method
- `getMethodLatency(methodId)` - method (NEW in Workload B)
- `emit('ddp-changed', ...)` - EventEmitter integration (NEW in Workload B)

#### Test Suite: `addLog` / Message Storage

**Test Case:** Should add DDP log to collection array

```typescript
describe('DDPStore', () => {
  describe('addLog', () => {
    it('should add DDP log to collection array', () => {
      // Arrange
      const store = new DDPStore()
      const log = {
        direction: 'received',
        message: { msg: 'ping' },
        parsedContent: { msg: 'ping' },
        timestamp: Date.now()
      }

      // Act
      store.addLog(log)

      // Assert
      expect(store.collection).toHaveLength(1)
      expect(store.collection[0]).toEqual(log)
    })
  })
})
```

**Test Case:** Should limit collection to prevent memory leaks

```typescript
it('should limit collection to maximum entries', () => {
  // Arrange
  const store = new DDPStore()
  const maxEntries = 1000 // Verify actual limit in code

  // Act - Add more than limit
  for (let i = 0; i < maxEntries + 100; i++) {
    store.addLog({
      parsedContent: { msg: 'method', id: `id-${i}` },
      timestamp: Date.now()
    })
  }

  // Assert
  expect(store.collection.length).toBeLessThanOrEqual(maxEntries)
})
```

#### Test Suite: `getMethodLatency` / RPC Timing Logic (Workload B)

**Test Case:** Should correctly calculate timeToResult and timeToReady for complete RPC lifecycle

```typescript
describe('getMethodLatency', () => {
  it('should calculate Time to Result and Time to Ready', () => {
    // Arrange
    const store = new DDPStore()
    const methodId = 'rpc-1'

    // Act - Simulate complete RPC lifecycle
    store.addLog({
      parsedContent: { msg: 'method', id: methodId, method: 'test', params: [] },
      timestamp: 1000
    })
    store.addLog({
      parsedContent: { msg: 'result', id: methodId, result: 'success' },
      timestamp: 1250
    })
    store.addLog({
      parsedContent: { msg: 'updated', methods: [methodId] },
      timestamp: 1600
    })

    const latency = store.getMethodLatency(methodId)

    // Assert
    expect(latency).toBeDefined()
    expect(latency.timeToResult).toBe(250) // 1250 - 1000
    expect(latency.timeToReady).toBe(600)  // 1600 - 1000
  })

  it('should handle unblocked methods (no updated message)', () => {
    // Arrange
    const store = new DDPStore()

    // Act
    store.addLog({ parsedContent: { msg: 'method', id: 'rpc-1' }, timestamp: 1000 })
    store.addLog({ parsedContent: { msg: 'result', id: 'rpc-1' }, timestamp: 1200 })
    // No 'updated' message

    const latency = store.getMethodLatency('rpc-1')

    // Assert
    expect(latency.timeToResult).toBe(200)
    expect(latency.timeToReady).toBeNull() // Or undefined, check implementation
  })
})
```

#### Test Suite: EventEmitter Integration (Workload B)

**Test Case:** Should emit 'ddp-changed' event when DDP changed message arrives

```typescript
describe('EventEmitter integration', () => {
  it('should emit ddp-changed event on DDP changed message', () => {
    // Arrange
    const store = new DDPStore()
    const spy = jest.fn()
    store.on('ddp-changed', spy)

    // Act
    store.addLog({
      parsedContent: {
        msg: 'changed',
        collection: 'users',
        id: '123',
        fields: { name: 'Alice' }
      },
      timestamp: Date.now()
    })

    // Assert
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({
      docId: '123',
      collection: 'users',
      fields: ['name']
    })
  })

  it('should NOT emit event for non-changed messages', () => {
    // Arrange
    const store = new DDPStore()
    const spy = jest.fn()
    store.on('ddp-changed', spy)

    // Act
    store.addLog({ parsedContent: { msg: 'method' }, timestamp: Date.now() })

    // Assert
    expect(spy).not.toHaveBeenCalled()
  })
})
```

---

### src/Stores/Panel/SubscriptionStore.ts (Missing - Priority: HIGH)

**Public API to test:**
- `subsWithMeta` - @computed getter
- Subscription lifecycle tracking
- `getDataLoadMetrics(sub)` - NEW in Workload B

#### Test Suite: Subscription Lifecycle

**Test Case:** Should correctly calculate readyTime and initialDataLoadBytes

```typescript
describe('SubscriptionStore', () => {
  describe('subscription lifecycle', () => {
    it('should calculate Ready Time and Initial Load bytes', () => {
      // Arrange
      const store = new SubscriptionStore(/* mock root store */)

      // Act - Simulate subscription lifecycle
      store.handleDDPMessage({
        msg: 'sub',
        id: 'sub1',
        name: 'mySub',
        timestamp: 2000
      })
      store.handleDDPMessage({
        msg: 'added',
        collection: 'posts',
        subId: 'sub1',
        byteSize: 150,
        timestamp: 2100
      })
      store.handleDDPMessage({
        msg: 'added',
        collection: 'posts',
        subId: 'sub1',
        byteSize: 250,
        timestamp: 2200
      })
      store.handleDDPMessage({
        msg: 'ready',
        subs: ['sub1'],
        timestamp: 2500
      })

      // Assert
      const sub = store.subscriptions.get('sub1')
      expect(sub.status).toBe('ready')
      expect(sub.readyTime).toBe(500) // 2500 - 2000
      expect(sub.initialDataLoadBytes).toBe(400) // 150 + 250
    })

    it('should mark subscription as stopped on nosub', () => {
      // Arrange
      const store = new SubscriptionStore(/* mock root store */)
      store.handleDDPMessage({ msg: 'sub', id: 'sub1', name: 'mySub' })

      // Act
      store.handleDDPMessage({ msg: 'nosub', id: 'sub1' })

      // Assert
      const sub = store.subscriptions.get('sub1')
      expect(sub.status).toBe('stopped')
    })
  })
})
```

---

### src/Stores/Panel/MinimongoStore/index.ts (Missing - Priority: HIGH)

**Public API to test:**
- `recordSnapshot()` - method (Workload D)
- `compareSnapshots()` - method (Workload D)
- `addMethodLog(log)` - @action (Workload A)
- `findLogs` - @computed getter (Workload A)
- `mutateLogs` - @computed getter (Workload A)

#### Test Suite: Snapshot Comparison (Memory Leak Detection)

**Test Case:** Should detect document growth between snapshots

```typescript
describe('MinimongoStore', () => {
  describe('snapshot comparison', () => {
    it('should detect document growth between snapshots', () => {
      // Arrange
      const store = new MinimongoStore(/* mock root store */)
      store.collections.set('posts', {
        docs: new Map([
          ['1', { _id: '1', title: 'Post 1' }],
          ['2', { _id: '2', title: 'Post 2' }]
        ])
      })

      // Act
      store.recordSnapshot() // Baseline
      store.collections.get('posts').docs.set('3', { _id: '3', title: 'Post 3' })
      const comparison = store.compareSnapshots()

      // Assert
      expect(comparison.deltas).toHaveProperty('posts')
      expect(comparison.deltas.posts).toBe(1) // +1 document
    })
  })
})
```

---

### src/Stores/Panel/PerformanceStore.ts (Missing - Priority: MEDIUM)

**Public API to test:**
- `addLongTask(task)` - @action (Workload D)
- `criticalTasks` - @computed getter (Workload D)

#### Test Suite: Long Task Tracking

**Test Case:** Should add long tasks from PerformanceObserver

```typescript
describe('PerformanceStore', () => {
  describe('long task tracking', () => {
    it('should add long tasks to the array', () => {
      // Arrange
      const store = new PerformanceStore(/* mock root store */)
      const task = {
        duration: 120,
        startTime: 500,
        name: 'self',
        attribution: []
      }

      // Act
      store.addLongTask(task)

      // Assert
      expect(store.longTasks).toHaveLength(1)
      expect(store.longTasks[0].duration).toBe(120)
    })

    it('should filter critical tasks (>100ms)', () => {
      // Arrange
      const store = new PerformanceStore(/* mock root store */)

      // Act
      store.addLongTask({ duration: 50, startTime: 0 }) // Not critical
      store.addLongTask({ duration: 120, startTime: 100 }) // Critical
      store.addLongTask({ duration: 200, startTime: 300 }) // Critical

      // Assert
      expect(store.criticalTasks).toHaveLength(2)
      expect(store.criticalTasks.every(t => t.duration > 100)).toBe(true)
    })
  })
})
```

---

## Expected Output

For each store, generate:
1. **Complete test file** with all test cases
2. **Coverage report estimate** (% of public API covered)
3. **Missing test scenarios** if any edge cases not covered

## Success Criteria

- [ ] All 7 stores have corresponding test files
- [ ] Each test file has 80%+ coverage of public API
- [ ] All tests follow existing style guide
- [ ] Tests are independent (no shared state)
- [ ] All MobX reactivity is properly tested

## Additional Notes

### MobX Testing Tips

**Testing @computed getters:**
```typescript
it('should reactively recompute when observable changes', () => {
  const store = new MyStore()

  // Initial state
  expect(store.computedValue).toBe(0)

  // Change observable
  store.setValue(5)

  // Computed should update
  expect(store.computedValue).toBe(5)
})
```

**Testing @action methods:**
```typescript
it('should update observable state via action', () => {
  const store = new MyStore()

  store.myAction(newValue)

  expect(store.myObservable).toBe(newValue)
})
```

### Browser Extension Specific

**Mock chrome APIs if needed:**
```typescript
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  }
}
```

---

**Ready to generate tests?** Start with `DDPStore.ts` and work your way through all stores systematically! 🚀
