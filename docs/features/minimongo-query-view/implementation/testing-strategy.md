# Testing Strategy

**Purpose:** Unified testing approach for all workloads
**Scope:** Unit tests, E2E tests, manual testing procedures

---

## Testing Pyramid

```
       /\
      /  \ E2E Tests (Manual + Cypress) - 10%
     /────\
    /      \ Integration Tests (Store interactions) - 20%
   /────────\
  /          \ Unit Tests (Pure logic) - 70%
 /────────────\
```

---

## Unit Testing (Jest)

### Setup

**Existing:** `jest.config.js` already configured in repo.

**Pattern:** Use existing test structure in `src/Pages/Panel/Minimongo/services/__tests__/`

### Test Targets by Workload

#### Workload A: Minimongo Instrumentation

```typescript
// src/Stores/Panel/MinimongoStore/__tests__/MinimongoStore.test.ts
describe('MinimongoStore', () => {
  it('should add method logs', () => { /* ... */ })
  it('should limit logs to 1000 entries', () => { /* ... */ })
  it('should filter find vs mutate logs', () => { /* ... */ })
})

// src/Services/__tests__/MinimongoDDPCorrelator.test.ts
describe('MinimongoDDPCorrelator', () => {
  it('should correlate query with DDP adds', () => { /* ... */ })
  it('should return NONE confidence when no DDP activity', () => { /* ... */ })
})
```

#### Workload B: DDP Enhancements

```typescript
// src/Stores/Panel/__tests__/DDPStore.test.ts
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

  it('should emit ddp-changed event', () => {
    const store = new DDPStore()
    const spy = jest.fn()

    store.on('ddp-changed', spy)

    store.addLog({
      parsedContent: { msg: 'changed', collection: 'users', id: '123', fields: { name: 'Alice' } },
      timestamp: Date.now()
    })

    expect(spy).toHaveBeenCalledWith({
      collection: 'users',
      docId: '123',
      fields: ['name']
    })
  })
})

// src/Stores/Panel/__tests__/SubscriptionStore.test.ts
describe('SubscriptionStore', () => {
  it('should calculate data load metrics', () => { /* ... */ })
  it('should calculate update rate', () => { /* ... */ })
})
```

#### Workload C: Tracker Reactivity

```typescript
// src/Stores/Panel/__tests__/TrackerStore.test.ts
describe('TrackerStore - Phantom Re-Run Detection', () => {
  it('should detect phantom re-run when DDP field not in dependency', () => {
    const store = new TrackerStore()

    store.createComputation('comp1', 'stack...', Date.now())
    store.registerDependency('comp1', {
      type: 'collection',
      collectionName: 'users',
      selector: { _id: '123' },
      options: { fields: { name: 1 } }
    })

    PanelStore.ddpStore.emit('ddp-changed', {
      docId: '123',
      collection: 'users',
      fields: ['commentCount']  // Different field!
    })

    store.markComputationReran('comp1')

    expect(store.phantomReRuns.length).toBe(1)
    expect(store.phantomReRuns[0].phantomFields).toContain('commentCount')
  })

  it('should track leaked computations', () => {
    const store = new TrackerStore()
    const oldTimestamp = Date.now() - (6 * 60 * 1000)

    store.createComputation('old-comp', 'stack...', oldTimestamp)

    expect(store.leakedComputations.length).toBe(1)
  })
})
```

#### Workload D: Performance Monitoring

```typescript
// src/Services/__tests__/PerformanceCorrelator.test.ts
describe('PerformanceCorrelator', () => {
  it('should correlate long task with DDP burst', () => {
    // Setup: DDP burst
    for (let i = 0; i < 10; i++) {
      PanelStore.ddpStore.collection.push({
        timestamp: 1000 + i,
        byteSize: 10000
      })
    }

    // Long task right after
    PanelStore.performanceStore.addLongTask({
      name: 'self',
      duration: 150,
      startTime: 1050
    })

    const correlations = performanceCorrelator.ddpCausedLongTasks

    expect(correlations.length).toBe(1)
    expect(correlations[0].confidence).toBe('HIGH')
  })
})
```

#### Workload E: Auditor

```typescript
// src/Services/__tests__/Auditor.test.ts
describe('Auditor', () => {
  it('should detect over-fetching', () => { /* ... */ })
  it('should detect N+1 queries', () => { /* ... */ })
  it('should detect overlapping subscriptions', () => { /* ... */ })
  it('should detect merge box conflicts', () => { /* ... */ })
})
```

---

## E2E Testing (Manual + Cypress)

### Manual Testing with `/devapp`

The `/devapp` Meteor application is the primary E2E test environment.

#### Test Routes to Add

```javascript
// devapp/imports/api/test-routes.js

// Test 1: Over-fetching
Meteor.publish('users-overfetch', function() {
  return Users.find({})  // Returns 1000 docs, but UI only shows 10
})

// Test 2: N+1 Queries
Template.userList.helpers({
  users() {
    return Users.find().fetch().map(user => {
      user.profile = Profiles.findOne({ userId: user._id })  // N+1!
      return user
    })
  }
})

// Test 3: Large Payload
Meteor.publish('large-payload', function() {
  return HugeDocuments.find({}, { limit: 100 })  // 100KB each = 10MB total
})

// Test 4: Chatty Subscription
Meteor.publish('chatty-posts', function() {
  let counter = 0

  const interval = setInterval(() => {
    this.changed('posts', 'fake-id', { counter: counter++ })
  }, 100)  // 10 updates/second

  this.ready()

  this.onStop(() => clearInterval(interval))
})

// Test 5: Phantom Re-Run
Meteor.publish('posts-with-extra-fields', function() {
  return Posts.find({}, {
    fields: {
      title: 1,
      content: 1,
      commentCount: 1,  // Not accessed in UI
      views: 1  // Not accessed in UI
    }
  })
})

Template.postList.helpers({
  posts() {
    return Posts.find({}, { fields: { title: 1, content: 1 } })  // Only uses 2 fields
  }
})

// Test 6: Overlapping Subscriptions
Meteor.publish('posts.list', function() {
  return Posts.find({}, { fields: { title: 1, author: 1 } })
})

Meteor.publish('posts.details', function() {
  return Posts.find({}, { fields: { title: 1, content: 1, comments: 1 } })
})

// Test 7: Memory Leak
Router.route('/leak-test', function() {
  // Subscribes but never cleans up
  Meteor.subscribe('posts-all')
  this.render('LeakTest')
})
```

#### Manual Test Procedures

**Test 1: Minimongo Query Logging**
1. Open `/devapp` in browser
2. Open DevTools → Minimongo tab
3. Navigate to page with queries
4. **Verify:** Query list shows operations with stack traces
5. **Verify:** Toggle "Enable stack traces" in Settings works

**Test 2: DDP Correlation**
1. Open Minimongo tab
2. Trigger DDP activity (subscribe to something)
3. **Verify:** Correlation badges appear on query rows
4. **Verify:** Badge shows "DDP: 5↑ 2↻ 1↓" format

**Test 3: RPC Latency Timeline**
1. Open DDP tab
2. Call a slow method: `Meteor.call('slowMethod')`
3. Click on method log
4. **Verify:** Timeline shows "method → result (50ms) → ready (200ms)"

**Test 4: Subscription Update Rate**
1. Open Subscriptions tab
2. Subscribe to `chatty-posts`
3. **Verify:** Update Rate column shows "10/min"
4. **Verify:** Ready Time and Initial Load columns populated

**Test 5: Tracker Reactivity**
1. Open Reactivity tab
2. Navigate to page with `Tracker.autorun`
3. **Verify:** Running Computations table shows entries
4. **Verify:** Re-run count increments when data changes

**Test 6: Phantom Re-Run Detection**
1. Subscribe to `posts-with-extra-fields`
2. Trigger field update on `commentCount`
3. **Verify:** Phantom Re-runs section shows issue
4. **Verify:** Recommendation includes `{ commentCount: 0 }`

**Test 7: Performance Correlation**
1. Open Performance tab
2. Subscribe to `large-payload`
3. **Verify:** Long task detected
4. **Verify:** DDP-Caused Long Tasks section shows correlation

**Test 8: Memory Leak Detection**
1. Open Performance tab
2. Click "Take Snapshot"
3. Navigate to `/leak-test` 10 times
4. Click "Compare with New Snapshot"
5. **Verify:** Table shows `posts` collection grew

**Test 9: Auditor Detection**
1. Open Auditor tab
2. Set up over-fetching scenario (subscribe to `users-overfetch`)
3. **Verify:** Over-fetching issue appears
4. **Verify:** N+1 detection (use userList template)
5. **Verify:** Overlapping subscriptions (subscribe to both `posts.list` and `posts.details`)

**Test 10: State Persistence (Architecture Gotcha 1)**
1. Open DDP tab
2. Generate DDP activity
3. Trigger HMR (save a file in `/devapp`)
4. **Verify:** DDP logs still visible after page reload
5. **Verify:** "Preserve log on navigation" checkbox in Settings

---

### Cypress E2E Tests (Future)

**When to add:** After manual testing validates all features work.

```typescript
// cypress/e2e/minimongo-query-logging.cy.ts
describe('Minimongo Query Logging', () => {
  it('should log queries with stack traces', () => {
    cy.visit('http://localhost:3000/devapp')
    cy.get('[data-test="minimongo-tab"]').click()
    cy.get('[data-test="query-log-row"]').should('have.length.greaterThan', 0)
  })
})

// cypress/e2e/phantom-rerun-detection.cy.ts
describe('Phantom Re-Run Detection', () => {
  it('should detect unused field updates', () => {
    cy.visit('http://localhost:3000/devapp')
    cy.get('[data-test="reactivity-tab"]').click()

    // Trigger field update
    cy.window().then((win) => {
      win.Meteor.call('updateCommentCount', 'post-id-1')
    })

    cy.get('[data-test="phantom-rerun-section"]')
      .should('contain', 'commentCount')
  })
})
```

---

## Testing Checklist by Workload

### Workload A
- ✅ Unit: MinimongoStore
- ✅ Unit: MinimongoDDPCorrelator
- ✅ E2E: Query logging works
- ✅ E2E: Correlation badges appear

### Workload B
- ✅ Unit: DDPStore RPC latency
- ✅ Unit: DDPStore EventEmitter
- ✅ Unit: SubscriptionStore data load metrics
- ✅ E2E: Timeline visualization renders
- ✅ E2E: Subscription columns show data

### Workload C
- ✅ Unit: TrackerStore phantom re-run detection
- ✅ Unit: TrackerStore leaked computations
- ✅ E2E: Computations tracked
- ✅ E2E: Phantom re-runs detected

### Workload D
- ✅ Unit: PerformanceCorrelator
- ✅ E2E: Long tasks detected
- ✅ E2E: Memory leak workflow

### Workload E
- ✅ Unit: Auditor (all detection types)
- ✅ E2E: Over-fetching detected
- ✅ E2E: N+1 detected
- ✅ E2E: Overlapping subscriptions detected

---

## CI/CD Integration

**Run unit tests on every PR:**

```yaml
# .github/workflows/test.yml
name: Tests

on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test
```

**E2E tests run on merge to main:**

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run devapp:start
      - run: npm run cypress:run
```

---

## Coverage Goals

- **Unit tests:** 80% code coverage
- **E2E tests:** All user-facing features validated
- **Manual testing:** All gotchas tested (HMR persistence, merge box)

---

**Document Status:** Testing guidance for all workloads
**Date:** 2025-10-05
