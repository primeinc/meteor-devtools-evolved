/**
 * Jest setup file - runs before all tests
 * Provides global mocks for browser extensions APIs
 */

/* global jest */

// Mock webextension-polyfill
jest.mock(
  'webextension-polyfill',
  () => ({
    runtime: {
      sendMessage: jest.fn(),
      onMessage: {
        addListener: jest.fn(),
      },
    },
    storage: {
      local: {
        get: jest.fn(),
        set: jest.fn(),
      },
    },
    tabs: {
      query: jest.fn(),
      sendMessage: jest.fn(),
    },
  }),
  { virtual: true },
)

// Clean up timers and reactions after each test to prevent hanging
afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})
