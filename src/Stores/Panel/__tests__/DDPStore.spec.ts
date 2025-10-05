/**
 * DDPStore Unit Tests
 *
 * Tests for core DDP message storage and subscription lifecycle tracking
 */

import { DDPStore } from '../DDPStore'
import { PanelStore } from '@/Stores/PanelStore'

// Mock dependencies
jest.mock('@/Bridge', () => ({
  clearCache: jest.fn(),
}))

jest.mock('@/Stores/PanelStore', () => ({
  PanelStore: {
    settingStore: {
      activeFilterBlacklist: [],
    },
  },
}))

jest.mock('@/Utils/MessageFormatter', () => ({
  generatePreview: jest.fn(content => `preview: ${content}`),
}))

describe('DDPStore', () => {
  let store: DDPStore

  beforeEach(() => {
    store = new DDPStore()
    // Reset mock
    PanelStore.settingStore.activeFilterBlacklist = []
  })

  describe('initialization', () => {
    it('should initialize with empty collection', () => {
      expect(store.collection).toEqual([])
      expect(store.inboundBytes).toBe(0)
      expect(store.outboundBytes).toBe(0)
      expect(store.newLogs).toEqual([])
    })
  })

  describe('pushItem', () => {
    it('should add log to buffer and process it', async () => {
      const log: any = {
        id: 'log1',
        content: '{"msg":"ping"}',
        parsedContent: { msg: 'ping' },
        timestamp: Date.now(),
        isInbound: true,
        size: 100,
      }

      store.pushItem(log)

      // Wait for debounced submitLogs to execute
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(store.collection.length).toBeGreaterThan(0)
    })

    it('should track inbound bytes via bufferCallback', () => {
      const logs: any[] = [
        {
          id: 'log1',
          content: '{"msg":"ping"}',
          parsedContent: { msg: 'ping' },
          timestamp: Date.now(),
          isInbound: true,
          size: 100,
        },
        {
          id: 'log2',
          content: '{"msg":"pong"}',
          parsedContent: { msg: 'pong' },
          timestamp: Date.now(),
          isInbound: true,
          size: 50,
        },
      ]

      // Call bufferCallback directly to test byte tracking
      if (store.bufferCallback) {
        store.bufferCallback(logs)
      }

      expect(store.inboundBytes).toBe(150)
    })

    it('should track outbound bytes via bufferCallback', () => {
      const logs: any[] = [
        {
          id: 'log1',
          content: '{"msg":"method"}',
          parsedContent: { msg: 'method' },
          timestamp: Date.now(),
          isInbound: false,
          isOutbound: true,
          size: 200,
        },
      ]

      if (store.bufferCallback) {
        store.bufferCallback(logs)
      }

      expect(store.outboundBytes).toBe(200)
    })
  })

  describe('clearLogs', () => {
    it('should clear all logs and reset byte counters', async () => {
      // Add some logs
      store.pushItem({
        id: 'log1',
        content: '{"msg":"ping"}',
        parsedContent: { msg: 'ping' },
        timestamp: Date.now(),
        isInbound: true,
        size: 100,
      } as any)

      await new Promise(resolve => setTimeout(resolve, 150))

      // Clear logs
      store.clearLogs()

      expect(store.collection).toEqual([])
      expect(store.inboundBytes).toBe(0)
      expect(store.outboundBytes).toBe(0)
    })
  })

  describe('filterRegularExpression', () => {
    it('should create regex from activeFilterBlacklist', () => {
      PanelStore.settingStore.activeFilterBlacklist = ['ping', 'pong']

      const regex = store.filterRegularExpression

      expect(regex.test('{"msg":"ping"}')).toBe(true)
      expect(regex.test('{"msg":"pong"}')).toBe(true)
      expect(regex.test('{"msg":"method"}')).toBe(false)
    })

    it('should handle empty blacklist', () => {
      PanelStore.settingStore.activeFilterBlacklist = []

      const regex = store.filterRegularExpression

      // Empty pattern should match nothing
      expect(regex.test('{"msg":"ping"}')).toBe(false)
    })
  })

  describe('subscriptionLogs', () => {
    it('should filter only sub and ready messages', () => {
      store.collection = [
        {
          parsedContent: { msg: 'sub', id: 'sub1', name: 'test' },
        } as any,
        {
          parsedContent: { msg: 'ready', subs: ['sub1'] },
        } as any,
        {
          parsedContent: { msg: 'method', id: 'method1' },
        } as any,
        {
          parsedContent: { msg: 'ping' },
        } as any,
      ]

      const subscriptionLogs = store.subscriptionLogs

      expect(subscriptionLogs).toHaveLength(2)
      expect(subscriptionLogs[0].parsedContent.msg).toBe('sub')
      expect(subscriptionLogs[1].parsedContent.msg).toBe('ready')
    })

    it('should return empty array when no subscription logs', () => {
      store.collection = [
        {
          parsedContent: { msg: 'method', id: 'method1' },
        } as any,
        {
          parsedContent: { msg: 'ping' },
        } as any,
      ]

      expect(store.subscriptionLogs).toHaveLength(0)
    })
  })

  describe('getSubscriptionInit', () => {
    it('should find subscription init log by id', () => {
      store.collection = [
        {
          parsedContent: { msg: 'sub', id: 'sub1', name: 'users' },
          timestamp: 1000,
        } as any,
        {
          parsedContent: { msg: 'sub', id: 'sub2', name: 'posts' },
          timestamp: 2000,
        } as any,
      ]

      const initLog = store.getSubscriptionInit({ id: 'sub1' } as any)

      expect(initLog).toBeDefined()
      expect(initLog?.parsedContent.id).toBe('sub1')
      expect(initLog?.parsedContent.name).toBe('users')
    })

    it('should return undefined when subscription not found', () => {
      store.collection = [
        {
          parsedContent: { msg: 'sub', id: 'sub1', name: 'users' },
        } as any,
      ]

      const initLog = store.getSubscriptionInit({ id: 'nonexistent' } as any)

      expect(initLog).toBeUndefined()
    })
  })

  describe('getSubscriptionReady', () => {
    it('should find ready log by subscription id', () => {
      store.collection = [
        {
          parsedContent: { msg: 'ready', subs: ['sub1', 'sub2'] },
          timestamp: 3000,
        } as any,
        {
          parsedContent: { msg: 'ready', subs: ['sub3'] },
          timestamp: 4000,
        } as any,
      ]

      const readyLog = store.getSubscriptionReady({ id: 'sub1' } as any)

      expect(readyLog).toBeDefined()
      expect(readyLog?.parsedContent.subs).toContain('sub1')
    })

    it('should return undefined when ready log not found', () => {
      store.collection = [
        {
          parsedContent: { msg: 'ready', subs: ['sub1'] },
        } as any,
      ]

      const readyLog = store.getSubscriptionReady({ id: 'sub2' } as any)

      expect(readyLog).toBeUndefined()
    })
  })

  describe('getSubscriptionDuration', () => {
    it('should calculate duration when both init and ready exist', () => {
      store.collection = [
        {
          parsedContent: { msg: 'sub', id: 'sub1', name: 'users' },
          timestamp: 1000,
        } as any,
        {
          parsedContent: { msg: 'ready', subs: ['sub1'] },
          timestamp: 1500,
        } as any,
      ]

      const duration = store.getSubscriptionDuration({ id: 'sub1' } as any)

      expect(duration).toBe('500ms')
    })

    it('should return "waiting" when only init exists', () => {
      store.collection = [
        {
          parsedContent: { msg: 'sub', id: 'sub1', name: 'users' },
          timestamp: 1000,
        } as any,
      ]

      const duration = store.getSubscriptionDuration({ id: 'sub1' } as any)

      expect(duration).toBe('waiting')
    })

    it('should return "???" when only ready exists', () => {
      store.collection = [
        {
          parsedContent: { msg: 'ready', subs: ['sub1'] },
          timestamp: 1500,
        } as any,
      ]

      const duration = store.getSubscriptionDuration({ id: 'sub1' } as any)

      expect(duration).toBe('???')
    })

    it('should return "NA" when neither init nor ready exist', () => {
      store.collection = []

      const duration = store.getSubscriptionDuration({ id: 'sub1' } as any)

      expect(duration).toBe('NA')
    })
  })

  describe('getSubscriptionMeta', () => {
    it('should return meta object with init and ready logs', () => {
      store.collection = [
        {
          parsedContent: { msg: 'sub', id: 'sub1', name: 'users' },
          timestamp: 1000,
        } as any,
        {
          parsedContent: { msg: 'ready', subs: ['sub1'] },
          timestamp: 1500,
        } as any,
      ]

      const meta = store.getSubscriptionMeta({ id: 'sub1' } as any)

      expect(meta).toEqual({
        meta: {
          init: expect.objectContaining({
            parsedContent: expect.objectContaining({ msg: 'sub', id: 'sub1' }),
          }),
          ready: expect.objectContaining({
            parsedContent: expect.objectContaining({ msg: 'ready' }),
          }),
        },
      })
    })

    it('should return meta with undefined values when logs not found', () => {
      store.collection = []

      const meta = store.getSubscriptionMeta({ id: 'sub1' } as any)

      expect(meta).toEqual({
        meta: {
          init: undefined,
          ready: undefined,
        },
      })
    })
  })

  describe('filterFunction', () => {
    it('should filter by search term', () => {
      store.collection = [
        {
          content: '{"msg":"method","method":"users.insert"}',
          preview: 'users.insert',
          parsedContent: { msg: 'method' },
        } as any,
        {
          content: '{"msg":"method","method":"posts.find"}',
          preview: 'posts.find',
          parsedContent: { msg: 'method' },
        } as any,
      ]

      const filtered = store.filterFunction?.(store.collection, 'users')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].content).toContain('users.insert')
    })

    it('should filter by activeFilterBlacklist', () => {
      PanelStore.settingStore.activeFilterBlacklist = ['ping']

      store.collection = [
        {
          content: '{"msg":"ping"}',
          preview: 'ping',
          parsedContent: { msg: 'ping' },
        } as any,
        {
          content: '{"msg":"method"}',
          preview: 'method',
          parsedContent: { msg: 'method' },
        } as any,
      ]

      const filtered = store.filterFunction?.(store.collection, '')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].parsedContent.msg).toBe('method')
    })

    it('should apply both filters', () => {
      PanelStore.settingStore.activeFilterBlacklist = ['ping']

      store.collection = [
        {
          content: '{"msg":"ping"}',
          preview: 'ping',
          parsedContent: { msg: 'ping' },
        } as any,
        {
          content: '{"msg":"method","method":"users.insert"}',
          preview: 'users.insert',
          parsedContent: { msg: 'method' },
        } as any,
        {
          content: '{"msg":"method","method":"posts.find"}',
          preview: 'posts.find',
          parsedContent: { msg: 'method' },
        } as any,
      ]

      const filtered = store.filterFunction?.(store.collection, 'users')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].content).toContain('users.insert')
    })
  })

  describe('edge cases', () => {
    it('should handle logs with missing size property', () => {
      const logs: any[] = [
        {
          id: 'log1',
          content: '{"msg":"ping"}',
          parsedContent: { msg: 'ping' },
          timestamp: Date.now(),
          isInbound: true,
          // size is undefined
        },
      ]

      if (store.bufferCallback) {
        store.bufferCallback(logs)
      }

      // Should not throw and should default size to 0
      expect(store.inboundBytes).toBe(0)
    })

    it('should handle subscriptions with missing subs array', () => {
      store.collection = [
        {
          parsedContent: { msg: 'ready' }, // Missing subs
        } as any,
      ]

      const readyLog = store.getSubscriptionReady({ id: 'sub1' } as any)

      expect(readyLog).toBeUndefined()
    })
  })
})
