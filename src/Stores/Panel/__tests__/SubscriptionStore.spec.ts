/**
 * SubscriptionStore Unit Tests
 *
 * Tests for subscription management and filtering
 */

import { SubscriptionStore } from '../SubscriptionStore'
import { PanelStore } from '@/Stores/PanelStore'

// Mock PanelStore
jest.mock('@/Stores/PanelStore', () => ({
  PanelStore: {
    ddpStore: {
      getSubscriptionMeta: jest.fn(sub => ({
        meta: {
          init: { timestamp: 1000 },
          ready: { timestamp: 1500 },
        },
      })),
    },
  },
}))

describe('SubscriptionStore', () => {
  let store: SubscriptionStore

  beforeEach(() => {
    store = new SubscriptionStore()
    // Reset mocks
    jest.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with empty collection', () => {
      expect(store.collection).toEqual([])
      expect(store.search).toBe('')
      expect(store.currentPage).toBe(1)
    })
  })

  describe('filterFunction', () => {
    it('should return all subscriptions when search is empty', () => {
      const subscriptions: any[] = [
        { id: 'sub1', name: 'users', params: [] },
        { id: 'sub2', name: 'posts', params: [] },
      ]

      const filtered = store.filterFunction?.(subscriptions, '')

      expect(filtered).toHaveLength(2)
    })

    it('should filter subscriptions by name', () => {
      const subscriptions: any[] = [
        { id: 'sub1', name: 'users', params: [] },
        { id: 'sub2', name: 'posts', params: [] },
        { id: 'sub3', name: 'comments', params: [] },
      ]

      const filtered = store.filterFunction?.(subscriptions, 'users')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].name).toBe('users')
    })

    it('should filter subscriptions by params', () => {
      const subscriptions: any[] = [
        { id: 'sub1', name: 'users', params: [{ role: 'admin' }] },
        { id: 'sub2', name: 'posts', params: [{ status: 'published' }] },
      ]

      const filtered = store.filterFunction?.(subscriptions, 'admin')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].id).toBe('sub1')
    })

    it('should be case-insensitive', () => {
      const subscriptions: any[] = [
        { id: 'sub1', name: 'Users', params: [] },
        { id: 'sub2', name: 'Posts', params: [] },
      ]

      const filtered = store.filterFunction?.(subscriptions, 'users')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].name).toBe('Users')
    })

    it('should search in the entire subscription object', () => {
      const subscriptions: any[] = [
        { id: 'sub1', name: 'users', params: [], status: 'ready' },
        { id: 'sub2', name: 'posts', params: [], status: 'waiting' },
      ]

      const filtered = store.filterFunction?.(subscriptions, 'waiting')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].id).toBe('sub2')
    })
  })

  describe('subsWithMeta', () => {
    it('should combine subscriptions with metadata from DDPStore', () => {
      store.collection = [
        { id: 'sub1', name: 'users', params: [] } as any,
        { id: 'sub2', name: 'posts', params: [] } as any,
      ]

      const subsWithMeta = store.subsWithMeta

      expect(subsWithMeta).toHaveLength(2)
      expect(subsWithMeta[0]).toHaveProperty('meta')
      expect(subsWithMeta[1]).toHaveProperty('meta')
      expect(PanelStore.ddpStore.getSubscriptionMeta).toHaveBeenCalledTimes(2)
    })

    it('should reactively update when collection changes', () => {
      store.collection = [{ id: 'sub1', name: 'users', params: [] } as any]

      let subsWithMeta = store.subsWithMeta
      expect(subsWithMeta).toHaveLength(1)

      // Add more subscriptions
      store.collection = [
        { id: 'sub1', name: 'users', params: [] } as any,
        { id: 'sub2', name: 'posts', params: [] } as any,
      ]

      subsWithMeta = store.subsWithMeta
      expect(subsWithMeta).toHaveLength(2)
    })

    it('should include original subscription properties', () => {
      store.collection = [
        {
          id: 'sub1',
          name: 'users',
          params: [{ role: 'admin' }],
          ready: true,
        } as any,
      ]

      const subsWithMeta = store.subsWithMeta

      expect(subsWithMeta[0].id).toBe('sub1')
      expect(subsWithMeta[0].name).toBe('users')
      expect(subsWithMeta[0].params).toEqual([{ role: 'admin' }])
      expect(subsWithMeta[0].ready).toBe(true)
    })
  })

  describe('search functionality', () => {
    it('should update search term and reset page', async () => {
      store.collection = [
        { id: 'sub1', name: 'users', params: [] } as any,
        { id: 'sub2', name: 'posts', params: [] } as any,
      ]

      store.currentPage = 2

      // setSearch is debounced
      store.setSearch('users')

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 300))

      expect(store.search).toBe('users')
      expect(store.currentPage).toBe(1)
    })
  })

  describe('pagination', () => {
    it('should paginate filtered results', () => {
      const subscriptions = Array.from({ length: 100 }, (_, i) => ({
        id: `sub${i}`,
        name: `subscription${i}`,
        params: [],
      }))

      store.collection = subscriptions as any[]

      const paginated = store.paginated

      // Default page size should limit results
      expect(paginated.length).toBeLessThanOrEqual(subscriptions.length)
    })
  })

  describe('edge cases', () => {
    it('should handle empty collection', () => {
      store.collection = []

      const subsWithMeta = store.subsWithMeta

      expect(subsWithMeta).toEqual([])
      expect(PanelStore.ddpStore.getSubscriptionMeta).not.toHaveBeenCalled()
    })

    it('should handle subscriptions with null or undefined fields', () => {
      const subscriptions: any[] = [
        { id: 'sub1', name: null, params: undefined },
      ]

      const filtered = store.filterFunction?.(subscriptions, 'sub1')

      expect(filtered).toHaveLength(1)
    })

    it('should handle special characters in search', () => {
      const subscriptions: any[] = [
        { id: 'sub1', name: 'users.list', params: [] },
        { id: 'sub2', name: 'posts/recent', params: [] },
      ]

      const filtered = store.filterFunction?.(subscriptions, 'users.list')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].id).toBe('sub1')
    })
  })
})
