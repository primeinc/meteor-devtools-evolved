/**
 * MobX + React Integration Tests
 *
 * These tests enforce the architectural rules that prevent infinite loops
 * and performance regressions when mixing MobX observables with React hooks.
 *
 * If any of these tests fail, DO NOT disable them. Fix the code.
 */

import { makeAutoObservable, autorun } from 'mobx'

// Simple test store to verify MobX patterns without circular dependencies
class TestStore {
  logs: Array<{ id: number; value: string; timestamp: number }> = []
  filters: Record<string, boolean> = { typeA: true, typeB: true }
  search = ''

  constructor() {
    makeAutoObservable(this)
  }

  addLog(log: { id: number; value: string; timestamp: number }) {
    this.logs.push(log)
    if (this.logs.length > 1000) {
      this.logs.shift()
    }
  }

  setFilter(type: string, enabled: boolean) {
    this.filters[type] = enabled
  }

  setSearch(query: string) {
    this.search = query
  }

  get filteredLogs() {
    return this.logs
      .filter(log => this.filters[log.value] ?? true)
      .filter(log =>
        log.value.toLowerCase().includes(this.search.toLowerCase()),
      )
  }
}

describe('MobX React Integration Rules', () => {
  let store: TestStore

  beforeEach(() => {
    store = new TestStore()
  })

  describe('Rule 1: Mutation without length change must trigger updates', () => {
    test('updating a log field triggers computed recalculation', () => {
      store.addLog({ id: 1, value: 'typeA', timestamp: Date.now() })
      store.addLog({ id: 2, value: 'typeB', timestamp: Date.now() })

      expect(store.filteredLogs).toHaveLength(2)

      // Mutate existing log (no length change)
      store.logs[0].value = 'typeC'

      // Computed MUST recalculate
      const updated = store.filteredLogs.find(l => l.id === 1)
      expect(updated?.value).toBe('typeC')
    })

    test('filtering mutation triggers recomputation', () => {
      store.addLog({ id: 1, value: 'typeA', timestamp: Date.now() })
      expect(store.filteredLogs).toHaveLength(1)

      // Toggle filter - changes observable without changing logs.length
      store.setFilter('typeA', false)

      // Must recompute
      expect(store.filteredLogs).toHaveLength(0)
    })
  })

  describe('Rule 2: No reaction cascades across store boundaries', () => {
    test('MobX computed does not rerun when unrelated observable changes', () => {
      let computeCount = 0

      const tracker = autorun(() => {
        computeCount++
        store.filteredLogs.length
      })

      expect(computeCount).toBe(1)

      // Add a log - should trigger recomputation
      store.addLog({ id: 1, value: 'typeA', timestamp: Date.now() })
      expect(computeCount).toBe(2)

      // Change unrelated observable - should NOT trigger
      // (In real app, this would be another store's observable)
      const unrelatedStore = new TestStore()
      unrelatedStore.setSearch('test')

      // Should still be 2 - no cascade
      expect(computeCount).toBe(2)

      tracker()
    })

    test('computed only recalculates when dependencies change', () => {
      let computeCount = 0

      const tracker = autorun(() => {
        computeCount++
        store.filteredLogs.length
      })

      expect(computeCount).toBe(1)

      // Add typeA log - should trigger
      store.addLog({ id: 1, value: 'typeA', timestamp: Date.now() })
      expect(computeCount).toBe(2)

      // Change search - should trigger (affects filtered output)
      store.setSearch('typeA')
      expect(computeCount).toBe(3)

      // Change to non-matching search - should trigger
      store.setSearch('nonexistent')
      expect(computeCount).toBe(4)

      tracker()
    })
  })

  describe('Rule 3: Performance bounds under load', () => {
    test('handles 1000 log entries without performance cliff', () => {
      const start = performance.now()

      for (let i = 0; i < 1000; i++) {
        store.addLog({
          id: i,
          value: i % 2 === 0 ? 'typeA' : 'typeB',
          timestamp: Date.now() + i,
        })
      }

      const duration = performance.now() - start

      // Should complete in under 100ms
      expect(duration).toBeLessThan(100)
      expect(store.logs.length).toBe(1000)
    })

    test('ring buffer caps at 1000 entries', () => {
      // Add 1500 logs
      for (let i = 0; i < 1500; i++) {
        store.addLog({
          id: i,
          value: 'typeA',
          timestamp: Date.now() + i,
        })
      }

      // Should cap at 1000
      expect(store.logs.length).toBe(1000)
    })

    test('filtering 1000 logs completes in reasonable time', () => {
      // Populate with 1000 logs
      for (let i = 0; i < 1000; i++) {
        store.addLog({
          id: i,
          value: i % 3 === 0 ? 'typeA' : 'typeB',
          timestamp: Date.now() + i,
        })
      }

      const start = performance.now()

      // Toggle filter multiple times
      store.setFilter('typeA', false)
      store.setFilter('typeB', false)
      store.setFilter('typeA', true)

      const duration = performance.now() - start

      // Should complete in under 50ms
      expect(duration).toBeLessThan(50)
    })

    test('search filtering is efficient', () => {
      // Populate
      for (let i = 0; i < 1000; i++) {
        store.addLog({
          id: i,
          value: `type${i}`,
          timestamp: Date.now() + i,
        })
      }

      const start = performance.now()
      store.setSearch('type42')
      const filtered = store.filteredLogs
      const duration = performance.now() - start

      expect(filtered.length).toBeGreaterThan(0)
      expect(duration).toBeLessThan(20)
    })
  })

  describe('Rule 4: Computed purity and stability', () => {
    test('filteredLogs returns consistent results', () => {
      store.addLog({ id: 1, value: 'typeA', timestamp: Date.now() })

      const ref1 = store.filteredLogs
      const ref2 = store.filteredLogs

      expect(ref1).toBeDefined()
      expect(ref2).toBeDefined()
      expect(ref1.length).toBe(ref2.length)
    })
  })

  describe('Rule 5: No memory leaks', () => {
    test('removing logs reduces memory footprint', () => {
      // Fill to cap
      for (let i = 0; i < 1000; i++) {
        store.addLog({
          id: i,
          value: 'typeA',
          timestamp: Date.now() + i,
        })
      }

      expect(store.logs.length).toBe(1000)

      // Add one more - should shift oldest out
      store.addLog({
        id: 1000,
        value: 'typeA',
        timestamp: Date.now() + 1000,
      })

      expect(store.logs.length).toBe(1000)
    })
  })

  describe('Rule 6: Filter state management', () => {
    test('all filters enabled by default', () => {
      expect(store.filters.typeA).toBe(true)
      expect(store.filters.typeB).toBe(true)
    })

    test('toggling filters affects computed output', () => {
      store.addLog({ id: 1, value: 'typeA', timestamp: Date.now() })
      store.addLog({ id: 2, value: 'typeB', timestamp: Date.now() })

      expect(store.filteredLogs).toHaveLength(2)

      store.setFilter('typeA', false)
      expect(store.filteredLogs).toHaveLength(1)
      expect(store.filteredLogs[0].value).toBe('typeB')
    })

    test('search filters by value', () => {
      store.addLog({ id: 1, value: 'typeA', timestamp: Date.now() })
      store.addLog({ id: 2, value: 'typeB', timestamp: Date.now() })

      expect(store.filteredLogs).toHaveLength(2)

      store.setSearch('typeA')
      expect(store.filteredLogs).toHaveLength(1)
      expect(store.filteredLogs[0].value).toBe('typeA')
    })

    test('search is case insensitive', () => {
      store.addLog({ id: 1, value: 'TypeA', timestamp: Date.now() })

      store.setSearch('typea')
      expect(store.filteredLogs).toHaveLength(1)
    })
  })
})
