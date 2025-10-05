/**
 * PerformanceStore Unit Tests
 *
 * Tests for performance data collection and aggregation
 */

import { PerformanceStore } from '../PerformanceStore'

describe('PerformanceStore', () => {
  let store: PerformanceStore<any>

  beforeEach(() => {
    store = new PerformanceStore()
  })

  describe('initialization', () => {
    it('should initialize with empty callMap and renderData', () => {
      expect(store.callMap.size).toBe(0)
      expect(store.renderData).toEqual([])
    })
  })

  describe('push', () => {
    it('should add new performance data', async () => {
      const data: CallData = {
        collectionName: 'users',
        key: 'find',
        args: '{}',
        runtime: 10,
      }

      store.push(data)

      // Wait for debounced updateRenderData
      await new Promise(resolve => setTimeout(resolve, 300))

      expect(store.callMap.size).toBe(1)
    })

    it('should aggregate multiple calls with same key', async () => {
      const data1: CallData = {
        collectionName: 'users',
        key: 'find',
        args: '{}',
        runtime: 10,
      }
      const data2: CallData = {
        collectionName: 'users',
        key: 'find',
        args: '{}',
        runtime: 20,
      }

      store.push(data1)
      store.push(data2)

      await new Promise(resolve => setTimeout(resolve, 300))

      const key = 'usersfind{}'
      const callData = store.callMap.get(key)

      expect(callData).toBeDefined()
      expect(callData?.calls).toBe(2)
      expect(callData?.runtime).toBe(30)
      // The average should be (10 + 20) / 2 = 15
      expect(callData?.averageRuntime).toBe(15)
    })

    it('should track updatedAt timestamp', async () => {
      const data: CallData = {
        collectionName: 'users',
        key: 'find',
        args: '{}',
        runtime: 10,
      }

      const beforePush = Date.now()
      store.push(data)

      await new Promise(resolve => setTimeout(resolve, 300))

      const key = 'usersfind{}'
      const callData = store.callMap.get(key)

      expect(callData?.updatedAt).toBeGreaterThanOrEqual(beforePush)
    })

    it('should create unique keys for different operations', async () => {
      const data1: CallData = {
        collectionName: 'users',
        key: 'find',
        args: '{}',
        runtime: 10,
      }
      const data2: CallData = {
        collectionName: 'users',
        key: 'insert',
        args: '{}',
        runtime: 20,
      }

      store.push(data1)
      store.push(data2)

      await new Promise(resolve => setTimeout(resolve, 300))

      expect(store.callMap.size).toBe(2)
    })

    it('should create unique keys for different collections', async () => {
      const data1: CallData = {
        collectionName: 'users',
        key: 'find',
        args: '{}',
        runtime: 10,
      }
      const data2: CallData = {
        collectionName: 'posts',
        key: 'find',
        args: '{}',
        runtime: 20,
      }

      store.push(data1)
      store.push(data2)

      await new Promise(resolve => setTimeout(resolve, 300))

      expect(store.callMap.size).toBe(2)
    })

    it('should create unique keys for different arguments', async () => {
      const data1: CallData = {
        collectionName: 'users',
        key: 'find',
        args: '{}',
        runtime: 10,
      }
      const data2: CallData = {
        collectionName: 'users',
        key: 'find',
        args: '{"role":"admin"}',
        runtime: 20,
      }

      store.push(data1)
      store.push(data2)

      await new Promise(resolve => setTimeout(resolve, 300))

      expect(store.callMap.size).toBe(2)
    })
  })

  describe('updateRenderData', () => {
    it('should limit renderData to top 100 entries', async () => {
      // Add 150 different performance entries
      for (let i = 0; i < 150; i++) {
        store.push({
          collectionName: 'users',
          key: 'find',
          args: `{"id":${i}}`,
          runtime: i,
        })
      }

      // Wait for debounced updateRenderData
      await new Promise(resolve => setTimeout(resolve, 300))

      expect(store.renderData.length).toBeLessThanOrEqual(100)
    })

    it('should sort by runtime in descending order', async () => {
      store.push({
        collectionName: 'users',
        key: 'find',
        args: '{"id":1}',
        runtime: 50,
      })
      store.push({
        collectionName: 'posts',
        key: 'find',
        args: '{"id":2}',
        runtime: 200,
      })
      store.push({
        collectionName: 'comments',
        key: 'find',
        args: '{"id":3}',
        runtime: 100,
      })

      await new Promise(resolve => setTimeout(resolve, 300))

      expect(store.renderData[0].runtime).toBe(200)
      expect(store.renderData[1].runtime).toBe(100)
      expect(store.renderData[2].runtime).toBe(50)
    })
  })

  describe('clear', () => {
    it('should clear all performance data', async () => {
      store.push({
        collectionName: 'users',
        key: 'find',
        args: '{}',
        runtime: 10,
      })
      store.push({
        collectionName: 'posts',
        key: 'insert',
        args: '{}',
        runtime: 20,
      })

      await new Promise(resolve => setTimeout(resolve, 300))

      expect(store.callMap.size).toBeGreaterThan(0)
      expect(store.renderData.length).toBeGreaterThan(0)

      store.clear()

      expect(store.callMap.size).toBe(0)
      expect(store.renderData).toEqual([])
    })
  })

  describe('edge cases', () => {
    it('should handle zero runtime', async () => {
      const data: CallData = {
        collectionName: 'users',
        key: 'find',
        args: '{}',
        runtime: 0,
      }

      store.push(data)

      await new Promise(resolve => setTimeout(resolve, 300))

      const key = 'usersfind{}'
      const callData = store.callMap.get(key)

      expect(callData?.runtime).toBe(0)
      expect(callData?.averageRuntime).toBe(0)
    })

    it('should handle very large runtime values', async () => {
      const data: CallData = {
        collectionName: 'users',
        key: 'find',
        args: '{}',
        runtime: 999999,
      }

      store.push(data)

      await new Promise(resolve => setTimeout(resolve, 300))

      const key = 'usersfind{}'
      const callData = store.callMap.get(key)

      expect(callData?.runtime).toBe(999999)
    })

    it('should handle empty collection name', async () => {
      const data: CallData = {
        collectionName: '',
        key: 'find',
        args: '{}',
        runtime: 10,
      }

      expect(() => store.push(data)).not.toThrow()
    })

    it('should handle empty args', async () => {
      const data: CallData = {
        collectionName: 'users',
        key: 'find',
        args: '',
        runtime: 10,
      }

      store.push(data)

      await new Promise(resolve => setTimeout(resolve, 300))

      expect(store.callMap.size).toBe(1)
    })

    it('should calculate correct average after multiple pushes', async () => {
      const data: CallData = {
        collectionName: 'users',
        key: 'find',
        args: '{}',
        runtime: 10,
      }

      // Push same operation 3 times with different runtimes
      store.push({ ...data, runtime: 10 })
      store.push({ ...data, runtime: 20 })
      store.push({ ...data, runtime: 30 })

      await new Promise(resolve => setTimeout(resolve, 300))

      const key = 'usersfind{}'
      const callData = store.callMap.get(key)

      expect(callData?.calls).toBe(3)
      expect(callData?.runtime).toBe(60)
      // The average should be (10 + 20 + 30) / 3 = 20
      expect(callData?.averageRuntime).toBe(20)
    })
  })

  describe('debouncing behavior', () => {
    it('should debounce rapid updates', async () => {
      // Push multiple items rapidly
      for (let i = 0; i < 10; i++) {
        store.push({
          collectionName: 'users',
          key: 'find',
          args: `{"id":${i}}`,
          runtime: i * 10,
        })
      }

      // renderData should not be updated immediately
      expect(store.renderData.length).toBe(0)

      // Wait for debounce to complete
      await new Promise(resolve => setTimeout(resolve, 300))

      // Now renderData should be populated
      expect(store.renderData.length).toBe(10)
    })

    it('should respect maxWait for debounce', async () => {
      // Push items continuously
      const interval = setInterval(() => {
        store.push({
          collectionName: 'users',
          key: 'find',
          args: `{"time":${Date.now()}}`,
          runtime: 10,
        })
      }, 100)

      // Wait for maxWait (5000ms) + buffer
      await new Promise(resolve => setTimeout(resolve, 5500))

      clearInterval(interval)

      // renderData should have been updated at least once due to maxWait
      expect(store.renderData.length).toBeGreaterThan(0)
    }, 10000) // Increase timeout to 10s for this test
  })
})
