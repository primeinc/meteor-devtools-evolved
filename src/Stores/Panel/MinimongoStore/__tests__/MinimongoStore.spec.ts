import { MinimongoMethodLog } from '../types'

// Mock dependencies to avoid ESM issues in tests
jest.mock('pretty-bytes', () => jest.fn(bytes => `${bytes} B`))
jest.mock('@/Utils/BridgeAdapter', () => ({}))
jest.mock('@/Pages/Panel/Minimongo/services/ExportService', () => ({}))
jest.mock('@/Pages/Panel/Minimongo/services/MongoExportFormats', () => ({}))
jest.mock('@/Utils/Logger', () => ({
  createLogger: () => ({ info: jest.fn(), debug: jest.fn(), error: jest.fn() }),
}))
jest.mock('@/Stores/PanelStore', () => ({
  PanelStore: {
    settingStore: {
      isQueryStackTraceEnabled: false,
    },
  },
}))

import { MinimongoStore } from '../index'

describe('MinimongoStore - Method Logs', () => {
  let store: MinimongoStore

  beforeEach(() => {
    store = new MinimongoStore()
  })

  describe('addMethodLog', () => {
    it('should add method logs', () => {
      const log: MinimongoMethodLog = {
        collectionName: 'users',
        method: 'find',
        selector: { _id: '123' },
        runtime: 5,
        timestamp: Date.now(),
      }

      store.addMethodLog(log)

      expect(store.methodLogs.length).toBe(1)
      expect(store.methodLogs[0]).toEqual(log)
    })

    it('should limit logs to 1000 entries', () => {
      // Add 1001 logs
      for (let i = 0; i < 1001; i++) {
        store.addMethodLog({
          collectionName: 'test',
          method: 'find',
          selector: {},
          runtime: 1,
          timestamp: Date.now() + i,
        })
      }

      expect(store.methodLogs.length).toBe(1000)
      // First log should be removed (FIFO)
      expect(store.methodLogs[0].timestamp).toBeGreaterThan(0)
    })

    it('should preserve log details including stack trace', () => {
      const log: MinimongoMethodLog = {
        collectionName: 'posts',
        method: 'insert',
        selector: { title: 'Test Post' },
        modifier: undefined,
        options: undefined,
        runtime: 10,
        stackTrace: 'Error\n    at someFunction (file.js:10:5)',
        timestamp: 1234567890,
      }

      store.addMethodLog(log)

      // Stack trace should be stripped since isQueryStackTraceEnabled is false (mocked)
      expect(store.methodLogs[0].stackTrace).toBeUndefined()
    })

    it('should preserve stack trace when feature is enabled', () => {
      // Mock the setting as enabled
      PanelStore.settingStore.isQueryStackTraceEnabled = true

      const log: MinimongoMethodLog = {
        collectionName: 'posts',
        method: 'insert',
        selector: { title: 'Test Post' },
        runtime: 10,
        stackTrace: 'Error\n    at someFunction (file.js:10:5)',
        timestamp: 1234567890,
      }

      store.addMethodLog(log)

      // Stack trace should be preserved when enabled
      expect(store.methodLogs[0].stackTrace).toBe(
        'Error\n    at someFunction (file.js:10:5)',
      )

      // Reset for other tests
      mockPanelStore.PanelStore.settingStore.isQueryStackTraceEnabled = false
    })
  })

  describe('findLogs computed property', () => {
    it('should filter find and findOne logs', () => {
      store.addMethodLog({
        collectionName: 'users',
        method: 'find',
        selector: {},
        runtime: 1,
        timestamp: Date.now(),
      })

      store.addMethodLog({
        collectionName: 'users',
        method: 'findOne',
        selector: { _id: '123' },
        runtime: 1,
        timestamp: Date.now(),
      })

      store.addMethodLog({
        collectionName: 'users',
        method: 'insert',
        selector: { name: 'Alice' },
        runtime: 1,
        timestamp: Date.now(),
      })

      expect(store.findLogs.length).toBe(2)
      expect(store.findLogs[0].method).toBe('find')
      expect(store.findLogs[1].method).toBe('findOne')
    })

    it('should return empty array when no find logs exist', () => {
      store.addMethodLog({
        collectionName: 'users',
        method: 'insert',
        selector: {},
        runtime: 1,
        timestamp: Date.now(),
      })

      expect(store.findLogs.length).toBe(0)
    })
  })

  describe('mutateLogs computed property', () => {
    it('should filter insert, update, upsert, and remove logs', () => {
      const methods: Array<'insert' | 'update' | 'upsert' | 'remove'> = [
        'insert',
        'update',
        'upsert',
        'remove',
      ]

      methods.forEach(method => {
        store.addMethodLog({
          collectionName: 'users',
          method,
          selector: {},
          runtime: 1,
          timestamp: Date.now(),
        })
      })

      store.addMethodLog({
        collectionName: 'users',
        method: 'find',
        selector: {},
        runtime: 1,
        timestamp: Date.now(),
      })

      expect(store.mutateLogs.length).toBe(4)
      expect(store.mutateLogs.map(log => log.method)).toEqual(methods)
    })

    it('should return empty array when no mutate logs exist', () => {
      store.addMethodLog({
        collectionName: 'users',
        method: 'find',
        selector: {},
        runtime: 1,
        timestamp: Date.now(),
      })

      expect(store.mutateLogs.length).toBe(0)
    })
  })

  describe('integration scenarios', () => {
    it('should handle mixed log types correctly', () => {
      const logs: MinimongoMethodLog[] = [
        {
          collectionName: 'users',
          method: 'find',
          selector: {},
          runtime: 1,
          timestamp: 1,
        },
        {
          collectionName: 'posts',
          method: 'insert',
          selector: {},
          runtime: 2,
          timestamp: 2,
        },
        {
          collectionName: 'users',
          method: 'findOne',
          selector: {},
          runtime: 3,
          timestamp: 3,
        },
        {
          collectionName: 'posts',
          method: 'update',
          selector: {},
          runtime: 4,
          timestamp: 4,
        },
        {
          collectionName: 'users',
          method: 'remove',
          selector: {},
          runtime: 5,
          timestamp: 5,
        },
      ]

      logs.forEach(log => store.addMethodLog(log))

      expect(store.methodLogs.length).toBe(5)
      expect(store.findLogs.length).toBe(2)
      expect(store.mutateLogs.length).toBe(3)
    })

    it('should handle logs with all optional fields', () => {
      const log: MinimongoMethodLog = {
        collectionName: 'users',
        method: 'update',
        selector: { _id: '123' },
        modifier: { $set: { name: 'Bob' } },
        options: { multi: true },
        runtime: 15,
        stackTrace: 'Error\n    at update',
        timestamp: Date.now(),
      }

      store.addMethodLog(log)

      expect(store.methodLogs[0].modifier).toEqual({ $set: { name: 'Bob' } })
      expect(store.methodLogs[0].options).toEqual({ multi: true })
    })
  })
})
