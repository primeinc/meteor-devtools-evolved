import { MinimongoDDPCorrelator } from '../MinimongoDDPCorrelator'
import { PanelStore } from '@/Stores/PanelStore'
import { MinimongoMethodLog } from '@/Stores/Panel/MinimongoStore/types'

// Mock PanelStore
jest.mock('@/Stores/PanelStore', () => ({
  PanelStore: {
    ddpStore: {
      collection: [],
    },
  },
}))

describe('MinimongoDDPCorrelator', () => {
  let correlator: MinimongoDDPCorrelator

  beforeEach(() => {
    correlator = new MinimongoDDPCorrelator()
    // Clear the collection before each test
    PanelStore.ddpStore.collection = []
  })

  describe('getDDPAddsForCollection', () => {
    it('should filter DDP added messages for a collection', () => {
      PanelStore.ddpStore.collection = [
        {
          parsedContent: { msg: 'added', collection: 'users' },
          timestamp: 1000,
        },
        {
          parsedContent: { msg: 'changed', collection: 'users' },
          timestamp: 1001,
        },
        {
          parsedContent: { msg: 'added', collection: 'posts' },
          timestamp: 1002,
        },
      ] as any

      const result = correlator.getDDPAddsForCollection('users')

      expect(result.length).toBe(1)
      expect(result[0].parsedContent.msg).toBe('added')
      expect(result[0].parsedContent.collection).toBe('users')
    })

    it('should return empty array when no adds exist', () => {
      PanelStore.ddpStore.collection = [
        {
          parsedContent: { msg: 'changed', collection: 'users' },
          timestamp: 1000,
        },
      ] as any

      const result = correlator.getDDPAddsForCollection('users')

      expect(result.length).toBe(0)
    })
  })

  describe('getCorrelationForQuery', () => {
    it('should correlate query with DDP adds within time window', () => {
      PanelStore.ddpStore.collection = [
        {
          parsedContent: { msg: 'added', collection: 'users' },
          timestamp: 1000,
        },
        {
          parsedContent: { msg: 'added', collection: 'users' },
          timestamp: 1010,
        },
      ] as any

      const log: MinimongoMethodLog = {
        collectionName: 'users',
        method: 'find',
        selector: {},
        runtime: 5,
        timestamp: 1050,
      }

      const correlation = correlator.getCorrelationForQuery(log)

      expect(correlation.addedDocuments).toBe(2)
      expect(correlation.changedDocuments).toBe(0)
      expect(correlation.removedDocuments).toBe(0)
      expect(correlation.correlationConfidence).toBe('MEDIUM')
    })

    it('should return NONE confidence when no DDP activity within window', () => {
      PanelStore.ddpStore.collection = [
        {
          parsedContent: { msg: 'added', collection: 'users' },
          timestamp: 1000,
        },
      ] as any

      const log: MinimongoMethodLog = {
        collectionName: 'users',
        method: 'find',
        selector: {},
        runtime: 5,
        timestamp: 2000,
      }

      const correlation = correlator.getCorrelationForQuery(log)

      expect(correlation.addedDocuments).toBe(0)
      expect(correlation.correlationConfidence).toBe('NONE')
    })

    it('should return HIGH confidence for 5+ correlated messages', () => {
      PanelStore.ddpStore.collection = [
        {
          parsedContent: { msg: 'added', collection: 'users' },
          timestamp: 1000,
        },
        {
          parsedContent: { msg: 'added', collection: 'users' },
          timestamp: 1010,
        },
        {
          parsedContent: { msg: 'changed', collection: 'users' },
          timestamp: 1020,
        },
        {
          parsedContent: { msg: 'changed', collection: 'users' },
          timestamp: 1030,
        },
        {
          parsedContent: { msg: 'removed', collection: 'users' },
          timestamp: 1040,
        },
      ] as any

      const log: MinimongoMethodLog = {
        collectionName: 'users',
        method: 'find',
        selector: {},
        runtime: 5,
        timestamp: 1050,
      }

      const correlation = correlator.getCorrelationForQuery(log)

      expect(correlation.addedDocuments).toBe(2)
      expect(correlation.changedDocuments).toBe(2)
      expect(correlation.removedDocuments).toBe(1)
      expect(correlation.correlationConfidence).toBe('HIGH')
    })

    it('should not correlate different collections', () => {
      PanelStore.ddpStore.collection = [
        {
          parsedContent: { msg: 'added', collection: 'posts' },
          timestamp: 1000,
        },
      ] as any

      const log: MinimongoMethodLog = {
        collectionName: 'users',
        method: 'find',
        selector: {},
        runtime: 5,
        timestamp: 1050,
      }

      const correlation = correlator.getCorrelationForQuery(log)

      expect(correlation.correlationConfidence).toBe('NONE')
    })
  })
})
