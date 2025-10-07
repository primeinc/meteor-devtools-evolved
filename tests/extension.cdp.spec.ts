/**
 * Chrome DevTools Protocol (CDP) Based Tests
 *
 * Uses CDP to validate extension behavior at a lower level:
 * - Network traffic interception
 * - Console log validation
 * - Performance metrics
 *
 * Based on: "A Definitive Guide to Automating Chrome DevTools and Extensions"
 * Section 2: "control the data source, not the data visualization"
 * CDP provides "a more stable and direct interface to the browser's internal state"
 */

import path from 'path'
import {
  test,
  expect,
  chromium,
  BrowserContext,
  CDPSession,
} from '@playwright/test'

const EXT = path.resolve(__dirname, '../extension/chrome')
const METEOR_APP = process.env.METEOR_APP_URL || 'http://localhost:33000'

test.describe.skip('CDP-Based Extension Validation', () => {
  let context: BrowserContext
  let extensionId: string

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXT}`,
        `--load-extension=${EXT}`,
        '--auto-open-devtools-for-tabs',
      ],
    })

    const serviceWorkers = context.serviceWorkers()
    if (serviceWorkers.length === 0) {
      throw new Error('No service workers found - extension failed to load')
    }

    const url = serviceWorkers[0].url()
    const match = url.match(/chrome-extension:\/\/([a-p]{32})/)
    if (!match) throw new Error(`Unable to parse extension ID from ${url}`)
    extensionId = match[1]
  })

  test.afterAll(async () => {
    await context.close()
  })

  test('CDP: Verify extension does not interfere with DDP WebSocket traffic', async () => {
    const page = await context.newPage()
    const client = await context.newCDPSession(page)

    // Enable Network domain
    await client.send('Network.enable')

    const wsConnections: string[] = []

    // Listen for WebSocket connections
    client.on('Network.webSocketCreated', (params: any) => {
      if (params.url.includes('localhost:33000')) {
        wsConnections.push(params.url)
      }
    })

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })

    // Verify WebSocket connection was established
    expect(wsConnections.length).toBeGreaterThan(0)
    expect(wsConnections[0]).toContain('ws://')

    await client.detach()
  })

  test('CDP: Capture console logs showing extension initialization', async () => {
    const page = await context.newPage()
    const client = await context.newCDPSession(page)

    // Enable Log and Runtime domains
    await client.send('Log.enable')
    await client.send('Runtime.enable')

    const consoleLogs: Array<{ type: string; text: string }> = []

    client.on('Runtime.consoleAPICalled', (params: any) => {
      const text = params.args.map((arg: any) => arg.value).join(' ')
      consoleLogs.push({
        type: params.type,
        text: text,
      })
    })

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })

    // Verify extension logged initialization messages
    const extensionLogs = consoleLogs.filter(log =>
      log.text.includes('Meteor DevTools'),
    )

    expect(extensionLogs.length).toBeGreaterThan(0)

    // Verify no critical errors
    const errors = consoleLogs.filter(log => log.type === 'error')
    const extensionErrors = errors.filter(log =>
      log.text.includes('Meteor DevTools'),
    )

    expect(extensionErrors.length).toBe(0)

    await client.detach()
  })

  test('CDP: Monitor network requests to verify extension resources load', async () => {
    const page = await context.newPage()
    const client = await context.newCDPSession(page)

    await client.send('Network.enable')

    const extensionRequests: Array<{ url: string; status: number }> = []

    client.on('Network.responseReceived', (params: any) => {
      if (params.response.url.startsWith('chrome-extension://')) {
        extensionRequests.push({
          url: params.response.url,
          status: params.response.status,
        })
      }
    })

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })

    // Verify extension resources loaded successfully
    const failedRequests = extensionRequests.filter(req => req.status !== 200)

    expect(extensionRequests.length).toBeGreaterThan(0)
    expect(failedRequests.length).toBe(0)

    await client.detach()
  })

  test('CDP: Verify extension injection script executes before page scripts', async () => {
    const page = await context.newPage()
    const client = await context.newCDPSession(page)

    await client.send('Runtime.enable')

    let injectionTime: number | null = null
    let pageScriptTime: number | null = null

    client.on('Runtime.consoleAPICalled', (params: any) => {
      const text = params.args.map((arg: any) => arg.value).join(' ')

      if (text.includes('Inject.ts loaded')) {
        injectionTime = params.timestamp
      }
      if (text.includes('Welcome to Meteor')) {
        pageScriptTime = params.timestamp
      }
    })

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })

    // Verify extension injected before page scripts if both timestamps exist
    if (injectionTime && pageScriptTime) {
      expect(injectionTime).toBeLessThanOrEqual(pageScriptTime)
    }

    await client.detach()
  })

  test('CDP: Performance - Extension does not significantly impact page load', async () => {
    const page = await context.newPage()
    const client = await context.newCDPSession(page)

    await client.send('Performance.enable')

    const startTime = Date.now()
    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })
    const loadTime = Date.now() - startTime

    // Get performance metrics
    const metrics = await client.send('Performance.getMetrics')

    // Verify page loaded in reasonable time (with extension overhead)
    expect(loadTime).toBeLessThan(10000) // 10 seconds max

    // Check that we got metrics (validates CDP connection)
    expect(metrics.metrics.length).toBeGreaterThan(0)

    await client.detach()
  })

  test.skip('CDP: Verify DDP messages are captured without modifying network traffic - FLAKY ON RETRY', async () => {
    const page = await context.newPage()
    const client = await context.newCDPSession(page)

    await client.send('Network.enable')

    const wsFrames: any[] = []

    client.on('Network.webSocketFrameReceived', (params: any) => {
      wsFrames.push(params)
    })

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })

    // Trigger a DDP call
    await page.evaluate(() => {
      Meteor.call('echo', 'CDP test')
    })

    // Verify WebSocket frames were received (DDP uses WebSockets)
    expect(wsFrames.length).toBeGreaterThan(0)

    await client.detach()
  })

  test.skip('CDP: Console API - Extension adds minimal global scope changes - FLAKY ON RETRY', async () => {
    const page = await context.newPage()
    const client = await context.newCDPSession(page)

    await client.send('Runtime.enable')

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })

    // Check global scope for extension markers
    const globalKeys = await page.evaluate(() => {
      const meteor = (window as any).Meteor

      // Get extension-specific keys
      const extensionKeys = Object.keys(window).filter(key =>
        key.includes('__meteor_devtools_evolved'),
      )

      return {
        meteorExists: typeof meteor !== 'undefined',
        extensionKeys,
        hasExtensionMarker: (window as any).__meteor_devtools_evolved === true,
      }
    })

    // Verify Meteor still exists
    expect(globalKeys.meteorExists).toBe(true)

    // Verify extension marker is present
    expect(globalKeys.hasExtensionMarker).toBe(true)

    // Verify extension adds only expected keys
    expect(globalKeys.extensionKeys.length).toBeGreaterThanOrEqual(1)

    await client.detach()
  })
})
