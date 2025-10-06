/**
 * DDPStore Unit Tests
 *
 * Tests for core DDP message storage and subscription lifecycle tracking
 */

// Mock Logger first
jest.mock('@/Utils/Logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

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

import { DDPStore } from '../DDPStore'
import { PanelStore } from '@/Stores/PanelStore'

describe('DDPStore', () => {
  let store: DDPStore

  beforeEach(() => {
    jest.clearAllMocks()
    store = new DDPStore()
    // Reset mock
    PanelStore.settingStore.activeFilterBlacklist = []
  })

  afterEach(() => {
    // Clean up event listeners to prevent worker process warnings
    if (store && typeof store.removeAllListeners === 'function') {
      store.removeAllListeners()
    }
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
    it('should add log to buffer and process it', () => {
      jest.useFakeTimers()
      const log: any = {
        id: 'log1',
        content: '{"msg":"ping"}',
        parsedContent: { msg: 'ping' },
        timestamp: Date.now(),
        isInbound: true,
        size: 100,
      }

      store.pushItem(log)

      // Advance timers to run all debounced functions like submitLogs and setLoadingState
      jest.runAllTimers()

      expect(store.collection.length).toBeGreaterThan(0)
      expect(store.isLoading).toBe(false)

      jest.useRealTimers()
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
    it('should clear all logs and reset byte counters', () => {
      jest.useFakeTimers()

      // Add some logs
      store.pushItem({
        id: 'log1',
        content: '{"msg":"ping"}',
        parsedContent: { msg: 'ping' },
        timestamp: Date.now(),
        isInbound: true,
        size: 100,
      } as any)

      // Advance timers to process buffered logs
      jest.runAllTimers()

      // Clear logs
      store.clearLogs()

      expect(store.collection).toEqual([])
      expect(store.inboundBytes).toBe(0)
      expect(store.outboundBytes).toBe(0)

      jest.useRealTimers()
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

  describe('EventEmitter integration', () => {
    it('should emit ddp-changed events when changed messages arrive', () => {
      const listener = jest.fn()
      store.on('ddp-changed', listener)

      const changedLog: DDPLog = {
        id: 'test-1',
        content:
          '{"msg":"changed","id":"doc1","collection":"posts","fields":{"title":"New Title"}}',
        parsedContent: {
          msg: 'changed',
          id: 'doc1',
          collection: 'posts',
          fields: { title: 'New Title' },
        },
        isInbound: true,
        timestamp: Date.now(),
      }

      store.bufferCallback([changedLog])

      expect(listener).toHaveBeenCalledWith({
        docId: 'doc1',
        collection: 'posts',
        fields: ['title'],
      })
    })

    it('should not emit ddp-changed for non-changed messages', () => {
      const listener = jest.fn()
      store.on('ddp-changed', listener)

      const methodLog: DDPLog = {
        id: 'test-1',
        content: '{"msg":"method","id":"1","method":"test"}',
        parsedContent: {
          msg: 'method',
          id: '1',
          method: 'test',
        },
        isOutbound: true,
        timestamp: Date.now(),
      }

      store.bufferCallback([methodLog])

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('Computed filters', () => {
    beforeEach(() => {
      store.collection = [
        {
          id: 'method-1',
          content: '{}',
          parsedContent: {
            msg: 'method',
            id: '1',
            method: 'testMethod',
            params: ['arg1'],
          },
          timestamp: 1000,
        },
        {
          id: 'result-1',
          content: '{}',
          parsedContent: { msg: 'result', id: '1' },
          timestamp: 1050,
        },
        {
          id: 'updated-1',
          content: '{}',
          parsedContent: { msg: 'updated', methods: ['1'] },
          timestamp: 1100,
        },
        {
          id: 'sub-1',
          content: '{}',
          parsedContent: { msg: 'sub', id: 'sub1', name: 'posts' },
          timestamp: 2000,
        },
      ] as DDPLog[]
    })

    it('should filter method logs', () => {
      expect(store.methodLogs).toHaveLength(1)
      expect(store.methodLogs[0].parsedContent.msg).toBe('method')
    })

    it('should filter result logs', () => {
      expect(store.resultLogs).toHaveLength(1)
      expect(store.resultLogs[0].parsedContent.msg).toBe('result')
    })

    it('should filter updated logs', () => {
      expect(store.updatedLogs).toHaveLength(1)
      expect(store.updatedLogs[0].parsedContent.msg).toBe('updated')
    })
  })

  describe('RPC Latency Metrics', () => {
    beforeEach(() => {
      store.collection = [
        {
          id: 'method-1',
          content: '{}',
          parsedContent: {
            msg: 'method',
            id: '1',
            method: 'testMethod',
            params: ['arg1'],
          },
          timestamp: 1000,
        },
        {
          id: 'result-1',
          content: '{}',
          parsedContent: { msg: 'result', id: '1' },
          timestamp: 1050,
        },
        {
          id: 'updated-1',
          content: '{}',
          parsedContent: { msg: 'updated', methods: ['1'] },
          timestamp: 1100,
        },
      ] as DDPLog[]
    })

    it('should calculate RPC latency with result and updated', () => {
      const latency = store.getMethodLatency('1')

      expect(latency).not.toBeNull()
      expect(latency?.timeToResult).toBe(50)
      expect(latency?.timeToReady).toBe(100)
      expect(latency?.methodName).toBe('testMethod')
      expect(latency?.params).toEqual(['arg1'])
    })

    it('should calculate RPC latency without updated message', () => {
      store.collection = store.collection.filter(
        log => log.parsedContent.msg !== 'updated',
      )

      const latency = store.getMethodLatency('1')

      expect(latency).not.toBeNull()
      expect(latency?.timeToResult).toBe(50)
      expect(latency?.timeToReady).toBeNull()
    })

    it('should return null for missing method log', () => {
      const latency = store.getMethodLatency('non-existent')
      expect(latency).toBeNull()
    })

    it('should return null for missing result log', () => {
      store.collection = store.collection.filter(
        log => log.parsedContent.msg !== 'result',
      )

      const latency = store.getMethodLatency('1')
      expect(latency).toBeNull()
    })

    it('should find method result correctly', () => {
      const result = store.getMethodResult('1')
      expect(result).toBeDefined()
      expect(result?.parsedContent.msg).toBe('result')
    })

    it('should find method updated correctly', () => {
      const updated = store.getMethodUpdated('1')
      expect(updated).toBeDefined()
      expect(updated?.parsedContent.msg).toBe('updated')
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

  describe('Byte size tracking', () => {
    it('should track inbound bytes from logs with byteSize', () => {
      const logs: DDPLog[] = [
        {
          id: 'log-1',
          content: '{}',
          parsedContent: { msg: 'added' },
          isInbound: true,
          byteSize: 100,
          timestamp: Date.now(),
        },
        {
          id: 'log-2',
          content: '{}',
          parsedContent: { msg: 'changed' },
          isInbound: true,
          byteSize: 50,
          timestamp: Date.now(),
        },
      ]

      store.bufferCallback(logs)

      expect(store.inboundBytes).toBe(150)
    })

    it('should track outbound bytes from logs with byteSize', () => {
      const logs: DDPLog[] = [
        {
          id: 'log-1',
          content: '{}',
          parsedContent: { msg: 'method' },
          isOutbound: true,
          byteSize: 75,
          timestamp: Date.now(),
        },
      ]

      store.bufferCallback(logs)

      expect(store.outboundBytes).toBe(75)
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
