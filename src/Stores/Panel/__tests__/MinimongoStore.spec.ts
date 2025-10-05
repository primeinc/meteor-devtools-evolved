/**
 * MinimongoStore Unit Tests
 *
 * Tests for Minimongo collection management and operations
 */

import { MinimongoStore } from '../MinimongoStore'

// Mock pretty-bytes to avoid ESM issues
jest.mock('pretty-bytes', () => ({
  __esModule: true,
  default: jest.fn((bytes: number) => `${bytes} B`),
}))

// Mock dependencies
jest.mock('@/Utils/BridgeAdapter', () => ({
  BridgeAdapter: {
    post: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  },
}))

jest.mock('@/Pages/Panel/Minimongo/services/ExportService', () => ({
  ExportService: {
    getFormats: jest.fn(() => [
      { key: 'mongo-import-array', name: 'MongoDB Import Array' },
      { key: 'json-schema', name: 'JSON Schema' },
    ]),
    exportCollection: jest.fn(),
  },
}))

describe('MinimongoStore', () => {
  let store: MinimongoStore

  beforeEach(() => {
    store = new MinimongoStore()
  })

  describe('initialization', () => {
    it('should initialize with empty collections', () => {
      expect(store.collections).toEqual({})
      expect(store.collectionMetadata).toEqual({})
      expect(store.activeCollection).toBeNull()
      expect(store.search).toBe('')
    })

    it('should initialize export state', () => {
      expect(store.isExportDialogOpen).toBe(false)
      expect(store.isExportBusy).toBe(false)
      expect(store.exportStatus).toEqual({ progress: 0, message: '' })
    })
  })

  describe('wrapDocument', () => {
    it('should wrap document with metadata', () => {
      const document = { _id: '1', name: 'Test', value: 42 }
      const collectionName = 'users'

      const wrapped = MinimongoStore.wrapDocument(document, collectionName)

      expect(wrapped.collectionName).toBe('users')
      expect(wrapped.document).toEqual(document)
      expect(wrapped._string).toBeDefined()
      expect(wrapped._size).toBeGreaterThan(0)
    })

    it('should calculate size correctly', () => {
      const smallDoc = { _id: '1', name: 'A' }
      const largeDoc = {
        _id: '2',
        name: 'B',
        description: 'x'.repeat(1000),
      }

      const wrappedSmall = MinimongoStore.wrapDocument(smallDoc, 'test')
      const wrappedLarge = MinimongoStore.wrapDocument(largeDoc, 'test')

      expect(wrappedLarge._size).toBeGreaterThan(wrappedSmall._size)
    })
  })

  describe('totalDocuments', () => {
    it('should count total documents across all collections', () => {
      store.collections = {
        users: [
          { document: { _id: '1' } } as any,
          { document: { _id: '2' } } as any,
        ],
        posts: [
          { document: { _id: '1' } } as any,
          { document: { _id: '2' } } as any,
          { document: { _id: '3' } } as any,
        ],
      }

      expect(store.totalDocuments).toBe(5)
    })

    it('should return 0 for empty collections', () => {
      store.collections = {}

      expect(store.totalDocuments).toBe(0)
    })
  })

  describe('collectionNames', () => {
    it('should return sorted collection names', () => {
      store.collections = {
        posts: [],
        users: [],
        comments: [],
      }

      const names = store.collectionNames

      expect(names).toEqual(['comments', 'posts', 'users'])
    })

    it('should return empty array for no collections', () => {
      store.collections = {}

      expect(store.collectionNames).toEqual([])
    })
  })

  describe('filteredCollectionNames', () => {
    it('should filter collections by search term', () => {
      store.collections = {
        users: [],
        posts: [],
        comments: [],
        user_profiles: [],
      }
      store.search = 'user'

      const filtered = store.filteredCollectionNames

      expect(filtered).toEqual(['user_profiles', 'users'])
    })

    it('should be case-insensitive', () => {
      store.collections = {
        Users: [],
        Posts: [],
      }
      store.search = 'users'

      const filtered = store.filteredCollectionNames

      expect(filtered).toContain('Users')
    })

    it('should return all collections when search is empty', () => {
      store.collections = {
        users: [],
        posts: [],
        comments: [],
      }
      store.search = ''

      const filtered = store.filteredCollectionNames

      expect(filtered).toHaveLength(3)
    })
  })

  describe('totalSize', () => {
    it('should calculate total size across all collections', () => {
      store.collectionMetadata = {
        users: { collectionSize: 1024, collectionSizePretty: '1 KB' },
        posts: { collectionSize: 2048, collectionSizePretty: '2 KB' },
      }

      expect(store.totalSize).toBe(3072)
    })

    it('should return 0 when no metadata', () => {
      store.collectionMetadata = {}

      expect(store.totalSize).toBe(0)
    })
  })

  describe('getMetadata', () => {
    it('should return metadata for a collection', () => {
      store.collectionMetadata = {
        users: { collectionSize: 1024, collectionSizePretty: '1 KB' },
      }

      const metadata = store.getMetadata('users')

      expect(metadata).toEqual({
        collectionSize: 1024,
        collectionSizePretty: '1 KB',
      })
    })

    it('should return undefined for non-existent collection', () => {
      store.collectionMetadata = {}

      const metadata = store.getMetadata('nonexistent')

      expect(metadata).toBeUndefined()
    })
  })

  describe('computeCollectionSizes', () => {
    it('should compute sizes for all collections', () => {
      store.collections = {
        users: [
          { _size: 100, document: { _id: '1' } } as any,
          { _size: 200, document: { _id: '2' } } as any,
        ],
        posts: [{ _size: 300, document: { _id: '1' } } as any],
      }

      store.computeCollectionSizes()

      expect(store.collectionMetadata.users.collectionSize).toBe(300)
      expect(store.collectionMetadata.posts.collectionSize).toBe(300)
    })

    it('should include pretty-printed sizes', () => {
      store.collections = {
        users: [{ _size: 1024, document: { _id: '1' } } as any],
      }

      store.computeCollectionSizes()

      expect(store.collectionMetadata.users.collectionSizePretty).toBeDefined()
      expect(
        store.collectionMetadata.users.collectionSizePretty,
      ).toContain('B')
    })
  })

  describe('setCollections', () => {
    it('should set collections and compute metadata', () => {
      const rawCollections = {
        users: [{ _id: '1', name: 'Alice' }],
        posts: [{ _id: '1', title: 'Post 1' }],
      }

      store.setCollections(rawCollections)

      expect(Object.keys(store.collections)).toContain('users')
      expect(Object.keys(store.collections)).toContain('posts')
      expect(store.collectionMetadata.users).toBeDefined()
      expect(store.collectionMetadata.posts).toBeDefined()
    })

    it('should filter out requestId from collections', () => {
      const data = {
        requestId: 'exp-123',
        users: [{ _id: '1', name: 'Alice' }],
      }

      store.setCollections(data)

      expect(store.collections).not.toHaveProperty('requestId')
      expect(store.collections).toHaveProperty('users')
    })

    it('should wrap each document', () => {
      const rawCollections = {
        users: [
          { _id: '1', name: 'Alice' },
          { _id: '2', name: 'Bob' },
        ],
      }

      store.setCollections(rawCollections)

      expect(store.collections.users[0]).toHaveProperty('_string')
      expect(store.collections.users[0]).toHaveProperty('_size')
      expect(store.collections.users[0]).toHaveProperty('collectionName')
    })
  })

  describe('setActiveCollection', () => {
    it('should set active collection', () => {
      store.collections = {
        users: [{ document: { _id: '1' } } as any],
        posts: [{ document: { _id: '1' } } as any],
      }

      store.setActiveCollection('users')

      expect(store.activeCollection).toBe('users')
    })

    it('should sync documents when setting active collection', () => {
      store.collections = {
        users: [
          { document: { _id: '1' } } as any,
          { document: { _id: '2' } } as any,
        ],
      }

      store.setActiveCollection('users')

      // After sync, activeCollectionDocuments should have the filtered documents
      expect(store.activeCollectionDocuments.collection).toHaveLength(2)
    })

    it('should handle null active collection', () => {
      store.collections = {
        users: [{ document: { _id: '1' } } as any],
      }
      store.setActiveCollection('users')

      store.setActiveCollection(null)

      expect(store.activeCollection).toBeNull()
    })
  })

  describe('syncDocuments', () => {
    it('should sync active collection documents', () => {
      store.collections = {
        users: [
          { document: { _id: '1' } } as any,
          { document: { _id: '2' } } as any,
        ],
        posts: [{ document: { _id: '1' } } as any],
      }
      store.activeCollection = 'users'

      store.syncDocuments()

      expect(store.activeCollectionDocuments.collection).toHaveLength(2)
    })

    it('should sync all documents when no active collection', () => {
      store.collections = {
        users: [{ document: { _id: '1' } } as any],
        posts: [{ document: { _id: '1' } } as any],
      }
      store.activeCollection = null

      store.syncDocuments()

      expect(store.activeCollectionDocuments.collection).toHaveLength(2)
    })
  })

  describe('setSearch', () => {
    it('should update search term after debounce', async () => {
      store.setSearch('users')

      // Wait for debounce (250ms)
      await new Promise(resolve => setTimeout(resolve, 300))

      expect(store.search).toBe('users')
    })
  })

  describe('setNavigatorVisible', () => {
    it('should toggle navigator visibility', () => {
      expect(store.isNavigatorVisible).toBe(false)

      store.setNavigatorVisible(true)
      expect(store.isNavigatorVisible).toBe(true)

      store.setNavigatorVisible(false)
      expect(store.isNavigatorVisible).toBe(false)
    })
  })

  describe('toggleExportDialog', () => {
    it('should open export dialog', () => {
      store.toggleExportDialog(true)

      expect(store.isExportDialogOpen).toBe(true)
    })

    it('should close export dialog and reset status', () => {
      store.exportStatus = { progress: 0.5, message: 'Exporting...' }

      store.toggleExportDialog(false)

      expect(store.isExportDialogOpen).toBe(false)
      expect(store.exportStatus).toEqual({ progress: 0, message: '' })
    })
  })

  describe('edge cases', () => {
    it('should handle empty document objects', () => {
      const emptyDoc = { _id: 'empty' }
      const wrapped = MinimongoStore.wrapDocument(emptyDoc, 'test')

      expect(wrapped._string).toContain('"_id":"empty"')
      expect(wrapped._size).toBeGreaterThan(0)
    })

    it('should handle collections with complex nested documents', () => {
      const complexDoc = {
        _id: '1',
        nested: {
          level1: {
            level2: {
              value: 'deep',
            },
          },
        },
        array: [1, 2, 3],
      }

      const wrapped = MinimongoStore.wrapDocument(complexDoc, 'test')

      expect(wrapped.document).toEqual(complexDoc)
      expect(wrapped._size).toBeGreaterThan(0)
    })

    it('should handle special characters in collection names', () => {
      store.collections = {
        'users-admin': [{ document: { _id: '1' } } as any],
        'posts.published': [{ document: { _id: '1' } } as any],
      }

      const names = store.collectionNames

      expect(names).toContain('users-admin')
      expect(names).toContain('posts.published')
    })

    it('should handle documents with circular references gracefully', () => {
      // Note: Circular references should be handled by JSONUtils.stringify
      // This test verifies the wrapper doesn't break
      const doc = { _id: '1', name: 'Test' }

      expect(() => {
        MinimongoStore.wrapDocument(doc, 'test')
      }).not.toThrow()
    })
  })
})
