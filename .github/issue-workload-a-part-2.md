# Workload A - Part 2: DDP Correlation for Minimongo Queries

**Status:** Ready to implement (depends on PR #29 merge)
**Effort:** 4-5 hours
**Priority:** P1 (Core feature differentiator)
**Dependencies:** PR #29 (Minimongo Query Logging - Part 1)

---

## Context

PR #29 implemented **Part 1** of Workload A:
- ✅ Minimongo method wrapping with stack trace capture
- ✅ `MinimongoStore.methodLogs` observable
- ✅ Stack trace performance optimization
- ✅ UI integration with `QueryLogList` component
- ✅ Settings toggle for stack traces

**This issue tracks Part 2:** DDP Correlation - the core differentiator that makes this feature 10x more valuable than simple query logging.

---

## What We're Building

Correlate Minimongo queries with DDP activity to show developers:
- **Which DDP messages** triggered a query (added/changed/removed)
- **Correlation confidence** (HIGH when DDP activity detected within 100ms window)
- **Visual badges** showing DDP activity: "DDP: 5↑ 2↻ 1↓" (added/changed/removed counts)

**Why This Matters:**
Chrome DevTools can log Minimongo queries, but **only Meteor DevTools can correlate them with DDP protocol messages**. This is our unique value proposition.

---

## Implementation Tasks

### Task 1: Create `MinimongoDDPCorrelator.ts` Service (2-3h)

**Pattern to Copy:** `DDPStore.getSubscriptionMeta()` correlation methods

**Location:** `src/Services/MinimongoDDPCorrelator.ts`

**Implementation:**

```typescript
// src/Services/MinimongoDDPCorrelator.ts
import { PanelStore } from '../Stores/PanelStore'
import { computed } from 'mobx'
import { MinimongoMethodLog } from '../Stores/Panel/MinimongoStore/types'

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

    const addedDocuments = recentDDP.filter(
      l => l.parsedContent.msg === 'added'
    ).length
    const changedDocuments = recentDDP.filter(
      l => l.parsedContent.msg === 'changed'
    ).length
    const removedDocuments = recentDDP.filter(
      l => l.parsedContent.msg === 'removed'
    ).length

    return {
      addedDocuments,
      changedDocuments,
      removedDocuments,
      correlationConfidence: recentDDP.length > 0 ? 'HIGH' : 'NONE'
    }
  }
}

export const minimongoCorrelator = new MinimongoDDPCorrelator()
```

**Files to Create:**
- `src/Services/MinimongoDDPCorrelator.ts`

---

### Task 2: Add Correlation Badges to UI (1h)

**Pattern to Copy:** `Tag` component from Blueprint UI (see `DDPLogRow.tsx` for examples)

**Location:** `src/Pages/Panel/Minimongo/components/QueryLogRow.tsx`

**Implementation:**

```typescript
// src/Pages/Panel/Minimongo/components/QueryLogRow.tsx
import { Tag } from '@blueprintjs/core'
import { minimongoCorrelator } from '../../../../Services/MinimongoDDPCorrelator'

export const QueryLogRow = observer(({ log }: QueryLogRowProps) => {
  const correlation = minimongoCorrelator.getCorrelationForQuery(log)

  return (
    <Card interactive>
      {/* Existing fields: method, collection, runtime, selector... */}

      {/* NEW: Correlation badge */}
      {correlation.correlationConfidence === 'HIGH' && (
        <Tag intent="success">
          DDP: {correlation.addedDocuments}↑ {correlation.changedDocuments}↻ {correlation.removedDocuments}↓
        </Tag>
      )}

      {/* Existing stack trace collapsible... */}
    </Card>
  )
})
```

**Files to Modify:**
- `src/Pages/Panel/Minimongo/components/QueryLogRow.tsx`

---

### Task 3: Add Tests (1h)

**Pattern to Copy:** Existing tests in `src/Pages/Panel/Minimongo/services/__tests__/`

**Location:** `src/Services/__tests__/MinimongoDDPCorrelator.test.ts`

**Test Cases:**

```typescript
// src/Services/__tests__/MinimongoDDPCorrelator.test.ts
import { minimongoCorrelator } from '../MinimongoDDPCorrelator'
import { PanelStore } from '../../Stores/PanelStore'

describe('MinimongoDDPCorrelator', () => {
  beforeEach(() => {
    // Clear DDPStore for each test
    PanelStore.ddpStore.collection = []
  })

  it('should correlate query with DDP adds', () => {
    // Setup: Add DDP message to DDPStore
    PanelStore.ddpStore.collection.push({
      parsedContent: { msg: 'added', collection: 'users', id: '123' },
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
    expect(correlation.addedDocuments).toBe(0)
  })

  it('should correlate with multiple DDP message types', () => {
    // Setup: Add multiple DDP messages
    PanelStore.ddpStore.collection.push(
      { parsedContent: { msg: 'added', collection: 'posts', id: '1' }, timestamp: 2000 },
      { parsedContent: { msg: 'changed', collection: 'posts', id: '1' }, timestamp: 2020 },
      { parsedContent: { msg: 'removed', collection: 'posts', id: '2' }, timestamp: 2040 }
    )

    const log = {
      collectionName: 'posts',
      method: 'find',
      selector: {},
      runtime: 3,
      timestamp: 2050
    }

    const correlation = minimongoCorrelator.getCorrelationForQuery(log)

    expect(correlation.addedDocuments).toBe(1)
    expect(correlation.changedDocuments).toBe(1)
    expect(correlation.removedDocuments).toBe(1)
    expect(correlation.correlationConfidence).toBe('HIGH')
  })

  it('should not correlate when timestamp difference > 100ms', () => {
    PanelStore.ddpStore.collection.push({
      parsedContent: { msg: 'added', collection: 'users', id: '123' },
      timestamp: 1000
    })

    const log = {
      collectionName: 'users',
      method: 'find',
      selector: {},
      runtime: 5,
      timestamp: 1200  // 200ms difference - outside window
    }

    const correlation = minimongoCorrelator.getCorrelationForQuery(log)

    expect(correlation.correlationConfidence).toBe('NONE')
  })
})
```

**Files to Create:**
- `src/Services/__tests__/MinimongoDDPCorrelator.test.ts`

---

## Acceptance Criteria

**Part 2 Complete When:**
- ✅ `MinimongoDDPCorrelator` service created with correlation logic
- ✅ Correlation badges appear on `QueryLogRow` components showing DDP activity
- ✅ Badges use format "DDP: N↑ N↻ N↓" for added/changed/removed counts
- ✅ Correlation confidence scoring works (HIGH when activity within 100ms)
- ✅ All tests passing (unit tests for correlator)
- ✅ Playwright E2E tests pass (automated via MCP tool)

---

## Testing Plan

### Unit Tests (Task 3)
- ✅ Correlation with DDP adds
- ✅ Correlation with multiple message types
- ✅ NONE confidence when no DDP activity
- ✅ Timestamp window validation (100ms)

### Playwright E2E Testing (Automated via MCP)
Use the Playwright MCP tool to automate the following test scenarios:

**Test 1: DDP Correlation Badges Appear**
```
1. Navigate to `/devapp`
2. Open DevTools panel
3. Click Minimongo tab
4. Click Query Log sub-tab
5. Execute: await page.evaluate(() => Meteor.subscribe('users'))
6. Verify: Query rows contain Tag elements with text matching /DDP: \d+↑/
7. Assert: Badge intent is "success"
```

**Test 2: Changed Documents Correlation**
```
1. Continue from Test 1
2. Execute: await page.evaluate(() => Meteor.call('updateUser', 'user-id-1'))
3. Wait for new query log row
4. Verify: Latest badge shows changed document count (↻ symbol)
```

**Test 3: No Correlation When No DDP Activity**
```
1. Navigate to page with local-only queries
2. Open DevTools → Minimongo → Query Log
3. Execute: await page.evaluate(() => LocalCollection.find({}))
4. Verify: Query row exists but NO DDP badge present
```

**Implementation:** Let Playwright MCP handle all browser automation, assertions, and screenshotting. No need to write test files manually.

---

## Implementation Reference

**Full spec:** `docs/features/minimongo-query-view/implementation/workload-a-minimongo-instrumentation.md` (lines 280-470)

**Key Patterns to Copy:**
- `DDPStore.getSubscriptionMeta()` - MobX computed correlation methods
- `DDPLogRow.tsx` - Blueprint `Tag` component usage
- Existing test files - Jest + MobX testing patterns

---

## Files Summary

**Files to Create (2):**
1. `src/Services/MinimongoDDPCorrelator.ts` (~80 LOC)
2. `src/Services/__tests__/MinimongoDDPCorrelator.test.ts` (~120 LOC)

**Files to Modify (1):**
1. `src/Pages/Panel/Minimongo/components/QueryLogRow.tsx` (+15 LOC)

**Total New Code:** ~215 LOC

---

## Why This Matters

From `FEATURE_SPEC.md:45-53`:

> **Why Chrome DevTools Can't Solve This**
>
> Chrome DevTools can log Minimongo method calls, but it:
> - Doesn't track DDP protocol messages
> - Can't correlate client state with server messages
> - Can't detect stale or orphaned data
> - Can't validate query results against server truth
>
> **This is our opportunity to provide unique value.**

**Without Part 2:** We have basic query logging (Chrome DevTools can do this)
**With Part 2:** We have DDP correlation (ONLY Meteor DevTools can do this)

This is the core differentiator that makes this feature worth building.

---

## Related Issues

- #29 - Minimongo Query View (Part 1) - **Must be merged first**
- Future: State Persistence on HMR (Architecture Gotcha #1)
- Future: Workload E (Auditor) will use `minimongoCorrelator` service

---

**Ready to implement after PR #29 merges to `dev/main`.**
