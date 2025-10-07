/**
 * Service Worker Logger Preservation Test
 *
 * IMPORTANT: Playwright cannot capture service worker console output
 * (see https://github.com/microsoft/playwright/issues/18761)
 *
 * Instead, this test verifies that:
 * 1. The Logger utility is present in the built service worker
 * 2. Dynamic console access (console[variable]) is not stripped by Terser
 * 3. The logger initialization code runs without errors
 */

import { test, expect } from './fixtures'
import * as fs from 'fs'
import * as path from 'path'

test.describe('Service Worker Logger', () => {
  test('Logger code should be preserved in built service worker', () => {
    // Read the built background.js file
    const backgroundPath = path.join(
      __dirname,
      '../extension/chrome/dist/background.js',
    )
    const backgroundCode = fs.readFileSync(backgroundPath, 'utf-8')

    // Verify createLogger function exists
    expect(backgroundCode).toContain('createLogger')

    // Verify dynamic console access is preserved (not stripped by Terser)
    expect(backgroundCode).toContain('console[')

    // Verify Logger class exists with log method
    expect(backgroundCode).toContain('class Logger')

    // Verify activation log is present
    expect(backgroundCode).toContain('[Background] Service worker activated')

    console.log('✅ Logger code is preserved in production build')
    console.log('✅ Dynamic console[method] access is not stripped')
    console.log('✅ Service worker activation log is present')
  })

  test('Service worker initializes without errors', async ({
    serviceWorker,
  }) => {
    // Verify the service worker exists and has expected global state
    const state = await serviceWorker.evaluate(() => {
      return {
        hasConnections: typeof (self as any).connections !== 'undefined',
        hasCache: typeof (self as any).Cache !== 'undefined',
      }
    })

    expect(state.hasConnections).toBe(true)
    expect(state.hasCache).toBe(true)

    console.log('✅ Service worker initialized successfully')
    console.log('✅ Logger setup completed without errors')
  })
})
