// Mock dependencies to avoid import issues
jest.mock('@/Stores/PanelStore', () => ({
  PanelStore: {
    settingStore: {
      activeFilterBlacklist: [],
    },
  },
}))

jest.mock('@/Bridge', () => ({
  clearCache: jest.fn(),
}))

jest.mock('@/Utils/MessageFormatter', () => ({
  generatePreview: jest.fn(() => 'preview'),
}))

import { DDPStore } from '../DDPStore'

describe('DDPStore', () => {
  let store: DDPStore

  beforeEach(() => {
    store = new DDPStore()
  })

  afterEach(() => {
    // Clean up event listeners to prevent worker process warnings
    if (store && typeof store.removeAllListeners === 'function') {
      store.removeAllListeners()
    }
  })

  describe('EventEmitter integration', () => {
    it('should emit ddp-changed events when changed messages arrive', () => {
      const listener = jest.fn()
      store.on('ddp-changed', listener)

      const changedLog: DDPLog = {
        id: 'test-1',
        content: '{"msg":"changed","id":"doc1","collection":"posts","fields":{"title":"New Title"}}',
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
          parsedContent: { msg: 'method', id: '1', method: 'testMethod' },
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
          parsedContent: { msg: 'method', id: '1', method: 'testMethod', params: ['arg1'] },
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
      store.collection = store.collection.filter(log => log.parsedContent.msg !== 'updated')

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
      store.collection = store.collection.filter(log => log.parsedContent.msg !== 'result')

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
})
