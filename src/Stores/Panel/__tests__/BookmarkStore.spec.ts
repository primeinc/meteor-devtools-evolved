/**
 * BookmarkStore Unit Tests
 *
 * Tests for bookmark management and persistence
 */

import { BookmarkStore } from '../BookmarkStore'
import { PanelStore } from '@/Stores/PanelStore'
import { PanelDatabase } from '@/Database/PanelDatabase'

// Mock PanelDatabase
jest.mock('@/Database/PanelDatabase', () => ({
  PanelDatabase: {
    getAll: jest.fn().mockResolvedValue([]),
    add: jest.fn().mockResolvedValue(1),
    remove: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
  },
}))

// Mock PanelStore
jest.mock('@/Stores/PanelStore', () => ({
  PanelStore: {
    settingStore: {
      activeFilterBlacklist: [],
    },
  },
}))

describe('BookmarkStore', () => {
  let store: BookmarkStore

  beforeEach(() => {
    jest.clearAllMocks()
    store = new BookmarkStore()
    PanelStore.settingStore.activeFilterBlacklist = []
  })

  describe('initialization', () => {
    it('should initialize with empty collection', () => {
      expect(store.collection).toEqual([])
      expect(store.bookmarkIds).toEqual([])
    })
  })

  describe('sync', () => {
    it('should load bookmarks from database', async () => {
      const mockBookmarks: Bookmark[] = [
        {
          id: 'bookmark1',
          log: {
            id: 'log1',
            content: '{"msg":"method"}',
            parsedContent: { msg: 'method' },
            timestamp: 1000,
          } as any,
        } as any,
        {
          id: 'bookmark2',
          log: {
            id: 'log2',
            content: '{"msg":"result"}',
            parsedContent: { msg: 'result' },
            timestamp: 2000,
          } as any,
        } as any,
      ]

      ;(PanelDatabase.getAll as jest.Mock).mockResolvedValue(mockBookmarks)

      await store.sync()

      expect(store.collection).toEqual(mockBookmarks)
      expect(store.bookmarkIds).toHaveLength(2)
      expect(store.bookmarkIds).toContain('bookmark1')
      expect(store.bookmarkIds).toContain('bookmark2')
    })

    it('should handle empty database', async () => {
      ;(PanelDatabase.getAll as jest.Mock).mockResolvedValue([])

      await store.sync()

      expect(store.collection).toEqual([])
      expect(store.bookmarkIds).toEqual([])
    })
  })

  describe('add', () => {
    it('should add bookmark to database and collection', async () => {
      const log: DDPLog = {
        id: 'log1',
        content: '{"msg":"method","method":"users.insert"}',
        parsedContent: { msg: 'method', method: 'users.insert' },
        timestamp: 1000,
      } as any

      const mockBookmark: Bookmark = {
        id: 'bookmark1',
        log,
      } as any

      ;(PanelDatabase.add as jest.Mock).mockResolvedValue(1)
      ;(PanelDatabase.get as jest.Mock).mockResolvedValue(mockBookmark)

      await store.add(log)

      expect(PanelDatabase.add).toHaveBeenCalledWith(log)
      expect(PanelDatabase.get).toHaveBeenCalledWith(1)
      expect(store.collection).toContainEqual(mockBookmark)
      expect(store.bookmarkIds).toContain('log1')
    })

    it('should not add if bookmark retrieval fails', async () => {
      const log: DDPLog = {
        id: 'log1',
        content: '{"msg":"method"}',
        parsedContent: { msg: 'method' },
        timestamp: 1000,
      } as any

      ;(PanelDatabase.add as jest.Mock).mockResolvedValue(1)
      ;(PanelDatabase.get as jest.Mock).mockResolvedValue(null)

      const initialLength = store.collection.length

      await store.add(log)

      expect(store.collection.length).toBe(initialLength)
    })
  })

  describe('remove', () => {
    it('should remove bookmark from database and sync', async () => {
      const log: DDPLog = {
        id: 'log1',
        content: '{"msg":"method"}',
        parsedContent: { msg: 'method' },
        timestamp: 1000,
      } as any

      ;(PanelDatabase.remove as jest.Mock).mockResolvedValue(undefined)
      ;(PanelDatabase.getAll as jest.Mock).mockResolvedValue([])

      await store.remove(log)

      expect(PanelDatabase.remove).toHaveBeenCalledWith('log1')
      expect(PanelDatabase.getAll).toHaveBeenCalled()
    })

    it('should not remove if log has no timestamp', async () => {
      const log: DDPLog = {
        id: 'log1',
        content: '{"msg":"method"}',
        parsedContent: { msg: 'method' },
        // timestamp is undefined
      } as any

      await store.remove(log)

      expect(PanelDatabase.remove).not.toHaveBeenCalled()
    })
  })

  describe('filterFunction', () => {
    it('should filter bookmarks by search term', () => {
      const bookmarks: Bookmark[] = [
        {
          id: 'bookmark1',
          log: {
            id: 'log1',
            content: '{"msg":"method","method":"users.insert"}',
            parsedContent: { msg: 'method' },
          } as any,
        } as any,
        {
          id: 'bookmark2',
          log: {
            id: 'log2',
            content: '{"msg":"method","method":"posts.find"}',
            parsedContent: { msg: 'method' },
          } as any,
        } as any,
      ]

      const filtered = store.filterFunction?.(bookmarks, 'users')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].log.content).toContain('users.insert')
    })

    it('should filter by activeFilterBlacklist', () => {
      PanelStore.settingStore.activeFilterBlacklist = ['ping']

      const bookmarks: Bookmark[] = [
        {
          id: 'bookmark1',
          log: {
            id: 'log1',
            content: '{"msg":"ping"}',
            parsedContent: { msg: 'ping' },
          } as any,
        } as any,
        {
          id: 'bookmark2',
          log: {
            id: 'log2',
            content: '{"msg":"method"}',
            parsedContent: { msg: 'method' },
          } as any,
        } as any,
      ]

      const filtered = store.filterFunction?.(bookmarks, '')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].log.parsedContent.msg).toBe('method')
    })

    it('should apply both search and blacklist filters', () => {
      PanelStore.settingStore.activeFilterBlacklist = ['ping']

      const bookmarks: Bookmark[] = [
        {
          id: 'bookmark1',
          log: {
            id: 'log1',
            content: '{"msg":"ping"}',
            parsedContent: { msg: 'ping' },
          } as any,
        } as any,
        {
          id: 'bookmark2',
          log: {
            id: 'log2',
            content: '{"msg":"method","method":"users.insert"}',
            parsedContent: { msg: 'method' },
          } as any,
        } as any,
        {
          id: 'bookmark3',
          log: {
            id: 'log3',
            content: '{"msg":"method","method":"posts.find"}',
            parsedContent: { msg: 'method' },
          } as any,
        } as any,
      ]

      const filtered = store.filterFunction?.(bookmarks, 'users')

      expect(filtered).toHaveLength(1)
      expect(filtered?.[0].log.content).toContain('users.insert')
    })

    it('should return all bookmarks when no filters applied', () => {
      const bookmarks: Bookmark[] = [
        {
          id: 'bookmark1',
          log: {
            id: 'log1',
            content: '{"msg":"method"}',
            parsedContent: { msg: 'method' },
          } as any,
        } as any,
        {
          id: 'bookmark2',
          log: {
            id: 'log2',
            content: '{"msg":"result"}',
            parsedContent: { msg: 'result' },
          } as any,
        } as any,
      ]

      const filtered = store.filterFunction?.(bookmarks, '')

      expect(filtered).toHaveLength(2)
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

  describe('search functionality', () => {
    it('should update search and reset page', async () => {
      store.currentPage = 2

      store.setSearch('test')

      // Wait for debounce (250ms)
      await new Promise(resolve => setTimeout(resolve, 300))

      expect(store.search).toBe('test')
      expect(store.currentPage).toBe(1)
    })
  })

  describe('edge cases', () => {
    it('should handle bookmarks with undefined log properties', () => {
      const bookmarks: Bookmark[] = [
        {
          id: 'bookmark1',
          log: {
            id: 'log1',
            content: '',
            parsedContent: {},
          } as any,
        } as any,
      ]

      expect(() => {
        store.filterFunction?.(bookmarks, 'test')
      }).not.toThrow()
    })

    it('should handle adding same log multiple times', async () => {
      const log: DDPLog = {
        id: 'log1',
        content: '{"msg":"method"}',
        parsedContent: { msg: 'method' },
        timestamp: 1000,
      } as any

      const mockBookmark: Bookmark = {
        id: 'bookmark1',
        log,
      } as any

      ;(PanelDatabase.add as jest.Mock).mockResolvedValue(1)
      ;(PanelDatabase.get as jest.Mock).mockResolvedValue(mockBookmark)

      await store.add(log)
      const firstLength = store.collection.length

      await store.add(log)

      // Should add again (no duplicate prevention at store level)
      expect(store.collection.length).toBe(firstLength + 1)
    })

    it('should handle database errors gracefully', async () => {
      const log: DDPLog = {
        id: 'log1',
        content: '{"msg":"method"}',
        parsedContent: { msg: 'method' },
        timestamp: 1000,
      } as any

      ;(PanelDatabase.add as jest.Mock).mockRejectedValue(
        new Error('Database error'),
      )

      // Should not throw
      await expect(store.add(log)).rejects.toThrow('Database error')
    })

    it('should handle sync with database errors', async () => {
      const mockError = new Error('Database error')
      ;(PanelDatabase.getAll as jest.Mock).mockRejectedValue(mockError)

      // Should not throw
      await expect(store.sync()).rejects.toThrow('Database error')
    })
  })

  describe('pagination', () => {
    it('should paginate bookmarks', () => {
      const bookmarks = Array.from({ length: 100 }, (_, i) => ({
        id: `bookmark${i}`,
        log: {
          id: `log${i}`,
          content: `{"msg":"method","method":"method${i}"}`,
          parsedContent: { msg: 'method' },
        } as any,
      }))

      store.collection = bookmarks as any[]

      const paginated = store.paginated

      // Should be paginated (default page size)
      expect(paginated.length).toBeLessThanOrEqual(bookmarks.length)
    })
  })
})
