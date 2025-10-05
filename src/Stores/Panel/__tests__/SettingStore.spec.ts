/**
 * SettingStore Unit Tests
 *
 * Tests for application settings management and persistence
 */

import { SettingStore } from '../SettingStore'

// Mock PanelDatabase
jest.mock('@/Database/PanelDatabase', () => ({
  PanelDatabase: {
    getSettings: jest.fn().mockResolvedValue({}),
    saveSettings: jest.fn().mockResolvedValue(undefined),
  },
}))

// Mock FilterCriteria
jest.mock('@/Pages/Panel/DDP/FilterConstants', () => ({
  FilterCriteria: {
    heartbeat: ['ping', 'pong'],
    subscription: ['sub', 'unsub', 'ready', 'nosub'],
    collection: ['added', 'changed', 'removed'],
    method: ['method', 'result', 'updated'],
    connection: ['connect', 'connected'],
  },
}))

describe('SettingStore', () => {
  let store: SettingStore

  beforeEach(() => {
    jest.clearAllMocks()
    store = new SettingStore()
  })

  describe('initialization', () => {
    it('should initialize with default filter values', () => {
      expect(store.activeFilters.heartbeat).toBe(true)
      expect(store.activeFilters.subscription).toBe(true)
      expect(store.activeFilters.collection).toBe(true)
      expect(store.activeFilters.method).toBe(true)
      expect(store.activeFilters.connection).toBe(true)
    })

    it('should initialize with empty activeFilterBlacklist', () => {
      expect(store.activeFilterBlacklist).toEqual([])
    })

    it('should initialize with null repositoryData', () => {
      expect(store.repositoryData).toBeNull()
    })

    it('should not be hydrated initially', () => {
      expect(store.hydrated).toBe(false)
    })
  })

  describe('setRepositoryData', () => {
    it('should set repository data', () => {
      const repoData: IGitHubRepository = {
        name: 'meteor-devtools-evolved',
        stargazers_count: 100,
        open_issues_count: 5,
      } as any

      store.setRepositoryData(repoData)

      expect(store.repositoryData).toEqual(repoData)
    })
  })

  describe('updateRepositoryData', () => {
    it('should fetch and update repository data', async () => {
      const mockData = {
        name: 'meteor-devtools-evolved',
        stargazers_count: 150,
        open_issues_count: 10,
      }

      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue(mockData),
      } as any)

      store.updateRepositoryData()

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(store.repositoryData?.stargazers_count).toBe(150)
      expect(store.repositoryData?.open_issues_count).toBe(10)
    })

    it('should handle fetch errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

      // Should not throw
      expect(() => store.updateRepositoryData()).not.toThrow()

      consoleErrorSpy.mockRestore()
    })

    it('should not update with invalid data', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
      const invalidData = {
        name: 'meteor-devtools-evolved',
        // Missing stargazers_count and open_issues_count
      }

      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue(invalidData),
      } as any)

      const initialData = store.repositoryData
      store.updateRepositoryData()

      await new Promise(resolve => setTimeout(resolve, 100))

      // Should not update if data is invalid
      expect(store.repositoryData).toBe(initialData)

      consoleLogSpy.mockRestore()
    })
  })

  describe('setFilter', () => {
    it('should enable filter', () => {
      store.setFilter('heartbeat', true)

      expect(store.activeFilters.heartbeat).toBe(true)
    })

    it('should disable filter', () => {
      store.setFilter('heartbeat', false)

      expect(store.activeFilters.heartbeat).toBe(false)
    })

    it('should update activeFilterBlacklist when filter is disabled', () => {
      store.setFilter('heartbeat', false)

      // Heartbeat messages (ping, pong) should be in blacklist
      expect(store.activeFilterBlacklist).toContain('ping')
      expect(store.activeFilterBlacklist).toContain('pong')
    })

    it('should remove from blacklist when filter is enabled', () => {
      // Disable first
      store.setFilter('heartbeat', false)
      expect(store.activeFilterBlacklist.length).toBeGreaterThan(0)

      // Then enable
      store.setFilter('heartbeat', true)

      // Should not contain heartbeat messages
      expect(store.activeFilterBlacklist).not.toContain('ping')
      expect(store.activeFilterBlacklist).not.toContain('pong')
    })

    it('should handle multiple disabled filters', () => {
      store.setFilter('heartbeat', false)
      store.setFilter('subscription', false)

      // Should contain both heartbeat and subscription messages
      expect(store.activeFilterBlacklist).toContain('ping')
      expect(store.activeFilterBlacklist).toContain('sub')
      expect(store.activeFilterBlacklist).toContain('ready')
    })

    it('should update blacklist for all filter types', () => {
      const filterTypes: FilterType[] = [
        'heartbeat',
        'subscription',
        'collection',
        'method',
        'connection',
      ]

      filterTypes.forEach(type => {
        store.setFilter(type, false)
      })

      // Blacklist should contain messages from all categories
      expect(store.activeFilterBlacklist.length).toBeGreaterThan(0)
    })
  })

  describe('edge cases', () => {
    it('should handle toggling same filter multiple times', () => {
      store.setFilter('heartbeat', false)
      store.setFilter('heartbeat', true)
      store.setFilter('heartbeat', false)

      expect(store.activeFilters.heartbeat).toBe(false)
      expect(store.activeFilterBlacklist).toContain('ping')
    })

    it('should handle setting all filters to false', () => {
      store.setFilter('heartbeat', false)
      store.setFilter('subscription', false)
      store.setFilter('collection', false)
      store.setFilter('method', false)
      store.setFilter('connection', false)

      expect(store.activeFilterBlacklist.length).toBeGreaterThan(0)
      // All filters disabled means maximum blacklist
      expect(store.activeFilters.heartbeat).toBe(false)
      expect(store.activeFilters.subscription).toBe(false)
      expect(store.activeFilters.collection).toBe(false)
      expect(store.activeFilters.method).toBe(false)
      expect(store.activeFilters.connection).toBe(false)
    })

    it('should handle setting all filters to true', () => {
      // First disable all
      store.setFilter('heartbeat', false)
      store.setFilter('subscription', false)

      // Then enable all
      store.setFilter('heartbeat', true)
      store.setFilter('subscription', true)
      store.setFilter('collection', true)
      store.setFilter('method', true)
      store.setFilter('connection', true)

      expect(store.activeFilterBlacklist).toEqual([])
    })
  })

  describe('persistence', () => {
    it('should load settings on construction', async () => {
      // PanelDatabase is already mocked at the top of the file
      const { PanelDatabase } =
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('@/Database/PanelDatabase')

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(PanelDatabase.getSettings).toHaveBeenCalled()
    })

    it('should become hydrated after delay', async () => {
      expect(store.hydrated).toBe(false)

      // Wait for hydration delay (1000ms)
      await new Promise(resolve => setTimeout(resolve, 1100))

      expect(store.hydrated).toBe(true)
    })
  })
})
