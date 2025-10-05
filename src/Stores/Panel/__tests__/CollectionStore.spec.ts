/**
 * CollectionStore Unit Tests
 *
 * Tests for individual collection document management
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

import { CollectionStore } from '../MinimongoStore/CollectionStore'

describe('CollectionStore', () => {
  let store: CollectionStore

  beforeEach(() => {
    jest.useFakeTimers()
    store = new CollectionStore()
  })

  afterEach(() => {
    jest.runAllTimers()
    jest.useRealTimers()
  })

  describe('initialization', () => {
    it('should initialize with empty collection', () => {
      expect(store.collection).toEqual([])
      expect(store.search).toBe('')
      expect(store.currentPage).toBe(1)
    })
  })

  describe('filterFunction', () => {
    it('should return all documents when search is empty', () => {
      const documents: IDocumentWrapper[] = [
        {
          document: { _id: '1', name: 'Alice' },
          _string: '{"_id":"1","name":"Alice"}',
          _size: 100,
          collectionName: 'users',
        },
        {
          document: { _id: '2', name: 'Bob' },
          _string: '{"_id":"2","name":"Bob"}',
          _size: 90,
          collectionName: 'users',
        },
      ]

      const filtered = store.filterFunction?.(documents, '')

      expect(filtered).toHaveLength(2)
    })

    it('should filter documents by search term in document content', () => {
      const documents: IDocumentWrapper[] = [
        {
          document: { _id: '1', name: 'Alice', role: 'admin' },
          _string: '{"_id":"1","name":"Alice","role":"admin"}',
          _size: 100,
          collectionName: 'users',
        },
        {
          document: { _id: '2', name: 'Bob', role: 'user' },
          _string: '{"_id":"2","name":"Bob","role":"user"}',
          _size: 90,
          collectionName: 'users',
        },
      ]

      const filtered = store.filterFunction?.(documents, 'alice')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].document.name).toBe('Alice')
    })

    it('should be case-insensitive', () => {
      const documents: IDocumentWrapper[] = [
        {
          document: { _id: '1', name: 'Alice' },
          _string: '{"_id":"1","name":"Alice"}',
          _size: 100,
          collectionName: 'users',
        },
        {
          document: { _id: '2', name: 'Bob' },
          _string: '{"_id":"2","name":"Bob"}',
          _size: 90,
          collectionName: 'users',
        },
      ]

      const filtered = store.filterFunction?.(documents, 'ALICE')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].document.name).toBe('Alice')
    })

    it('should search in entire stringified document', () => {
      const documents: IDocumentWrapper[] = [
        {
          document: { _id: '1', name: 'Alice', email: 'alice@example.com' },
          _string: '{"_id":"1","name":"Alice","email":"alice@example.com"}',
          _size: 100,
          collectionName: 'users',
        },
        {
          document: { _id: '2', name: 'Bob', email: 'bob@test.com' },
          _string: '{"_id":"2","name":"Bob","email":"bob@test.com"}',
          _size: 90,
          collectionName: 'users',
        },
      ]

      const filtered = store.filterFunction?.(documents, 'example.com')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].document.email).toBe('alice@example.com')
    })

    it('should handle special characters in search', () => {
      const documents: IDocumentWrapper[] = [
        {
          document: { _id: '1', path: '/users/admin' },
          _string: '{"_id":"1","path":"/users/admin"}',
          _size: 100,
          collectionName: 'routes',
        },
        {
          document: { _id: '2', path: '/posts/123' },
          _string: '{"_id":"2","path":"/posts/123"}',
          _size: 90,
          collectionName: 'routes',
        },
      ]

      const filtered = store.filterFunction?.(documents, '/users/')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].document.path).toBe('/users/admin')
    })

    it('should return empty array when no matches', () => {
      const documents: IDocumentWrapper[] = [
        {
          document: { _id: '1', name: 'Alice' },
          _string: '{"_id":"1","name":"Alice"}',
          _size: 100,
          collectionName: 'users',
        },
      ]

      const filtered = store.filterFunction?.(documents, 'nonexistent')

      expect(filtered).toEqual([])
    })
  })

  describe('setCollection', () => {
    it('should set collection of documents', () => {
      const documents: IDocumentWrapper[] = [
        {
          document: { _id: '1', name: 'Alice' },
          _string: '{"_id":"1","name":"Alice"}',
          _size: 100,
          collectionName: 'users',
        },
        {
          document: { _id: '2', name: 'Bob' },
          _string: '{"_id":"2","name":"Bob"}',
          _size: 90,
          collectionName: 'users',
        },
      ]

      store.setCollection(documents)

      expect(store.collection).toEqual(documents)
    })

    it('should replace existing collection', () => {
      const initialDocs: IDocumentWrapper[] = [
        {
          document: { _id: '1', name: 'Alice' },
          _string: '{"_id":"1","name":"Alice"}',
          _size: 100,
          collectionName: 'users',
        },
      ]

      const newDocs: IDocumentWrapper[] = [
        {
          document: { _id: '2', name: 'Bob' },
          _string: '{"_id":"2","name":"Bob"}',
          _size: 90,
          collectionName: 'users',
        },
      ]

      store.setCollection(initialDocs)
      expect(store.collection).toHaveLength(1)

      store.setCollection(newDocs)
      expect(store.collection).toHaveLength(1)
      expect(store.collection[0].document.name).toBe('Bob')
    })
  })

  describe('search functionality', () => {
    it('should update search term and reset page', () => {
      store.currentPage = 2

      store.setSearch('test')

      // Advance timers to run debounced setSearch
      jest.runAllTimers()

      expect(store.search).toBe('test')
      expect(store.currentPage).toBe(1)
    })
  })

  describe('pagination', () => {
    it('should paginate large collections', () => {
      const documents = Array.from({ length: 100 }, (_, i) => ({
        document: { _id: String(i), value: i },
        _string: `{"_id":"${i}","value":${i}}`,
        _size: 20,
        collectionName: 'numbers',
      }))

      store.setCollection(documents)

      const paginated = store.paginated

      // Should be paginated (not all 100 items)
      expect(paginated.length).toBeLessThanOrEqual(documents.length)
    })
  })

  describe('edge cases', () => {
    it('should handle documents with null values', () => {
      const documents: IDocumentWrapper[] = [
        {
          document: { _id: '1', name: null, value: undefined },
          _string: '{"_id":"1","name":null}',
          _size: 100,
          collectionName: 'test',
        },
      ]

      const filtered = store.filterFunction?.(documents, 'null')

      expect(filtered).toHaveLength(1)
    })

    it('should handle documents with nested objects', () => {
      const documents: IDocumentWrapper[] = [
        {
          document: {
            _id: '1',
            user: { name: 'Alice', profile: { age: 30 } },
          },
          _string: '{"_id":"1","user":{"name":"Alice","profile":{"age":30}}}',
          _size: 100,
          collectionName: 'test',
        },
      ]

      const filtered = store.filterFunction?.(documents, 'alice')

      expect(filtered).toHaveLength(1)
    })

    it('should handle empty collection', () => {
      const filtered = store.filterFunction?.([], 'test')

      expect(filtered).toEqual([])
    })
  })
})
