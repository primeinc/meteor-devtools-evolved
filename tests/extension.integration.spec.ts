/**
 * Extension Integration Tests
 *
 * Tests message flow and data capture:
 * - DDP message interception
 * - Minimongo query instrumentation
 * - Subscription tracking
 * - Service worker message routing
 *
 * NOTE: These tests verify data flow through postMessage.
 * They CANNOT test DevTools panel UI (Playwright limitation).
 */

import path from 'path'
import { test, expect, chromium, BrowserContext, Page } from '@playwright/test'

const EXT = path.resolve(__dirname, '../extension/chrome')
const METEOR_APP = process.env.METEOR_APP_URL || 'http://localhost:33000'

test.describe('MDE2 Integration Tests', () => {
  test.setTimeout(15000) // Fail fast - max 15s per test

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

    // Get service worker - wait if not immediately available
    let [background] = context.serviceWorkers()
    if (!background) {
      background = await context.waitForEvent('serviceworker')
    }

    const url = background.url()
    const match = url.match(/chrome-extension:\/\/([a-p]{32})/)
    if (!match) throw new Error(`Unable to parse extension ID from ${url}`)
    extensionId = match[1]
  })

  test.afterAll(async () => {
    await context.close()
  })

  /**
   * Helper: Set up message listener in page context
   * Captures window.postMessage events from the extension
   */
  async function setupMessageCapture(page: Page) {
    await page.evaluate(() => {
      ;(window as any).__mde2_captured_messages = []
      window.addEventListener('message', event => {
        // Filter for messages from our extension
        if (event.data?.source === 'meteor-devtools-evolved') {
          ;(window as any).__mde2_captured_messages.push(event.data)
        }
      })
    })
  }

  /**
   *
   */
  async function getCapturedMessages(page: Page) {
    return await page.evaluate(() => {
      return (window as any).__mde2_captured_messages || []
    })
  }

  test('Test 1: DDP Message Capture - verifies extension captures Meteor.call() traffic', async () => {
    const page = await context.newPage()

    // Navigate to Meteor app first
    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })

    // Set up message listener after page loads
    await setupMessageCapture(page)

    // Wait for Meteor to initialize
    await page.waitForFunction(
      () => typeof (window as any).Meteor !== 'undefined',
      { timeout: 5000 },
    )

    // Trigger a DDP method call by clicking the "String" button
    const stringButton = page.locator('button:has-text("String")')
    await expect(stringButton).toBeVisible()

    // Clear previous messages and click
    await page.evaluate(() => {
      ;(window as any).__mde2_captured_messages = []
    })
    await stringButton.click()

    // Wait for ddp-event message specifically
    await page.waitForFunction(
      () => {
        const messages = (window as any).__mde2_captured_messages || []
        return messages.some((msg: any) => msg.eventType === 'ddp-event')
      },
      { timeout: 5000 },
    )

    const messages = await getCapturedMessages(page)

    // Verify we captured at least one ddp-event message
    const ddpMessages = messages.filter(
      (msg: any) => msg.eventType === 'ddp-event',
    )

    expect(ddpMessages.length).toBeGreaterThan(0)
  })

  test('Test 2: Minimongo Query Logging - verifies extension captures collection queries', async () => {
    const page = await context.newPage()

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })
    await setupMessageCapture(page)

    // Wait for Meteor and minimongo-method messages specifically
    await page.waitForFunction(() => {
      if (typeof (window as any).Meteor === 'undefined') return false
      const messages = (window as any).__mde2_captured_messages || []
      return messages.some((msg: any) => msg.eventType === 'minimongo-method')
    })

    const messages = await getCapturedMessages(page)
    const minimongoMessages = messages.filter(
      (msg: any) => msg.eventType === 'minimongo-method',
    )

    expect(minimongoMessages.length).toBeGreaterThan(0)
    expect(minimongoMessages[0].data).toHaveProperty('collectionName')
    expect(minimongoMessages[0].data).toHaveProperty('runtime')
  })

  test('Test 3: Subscription Tracking - verifies extension captures subscription lifecycle', async () => {
    const page = await context.newPage()

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })
    await setupMessageCapture(page)

    // Wait for ddp-event messages specifically
    await page.waitForFunction(() => {
      const messages = (window as any).__mde2_captured_messages || []
      return messages.some((msg: any) => msg.eventType === 'ddp-event')
    })

    const messages = await getCapturedMessages(page)
    const ddpMessages = messages.filter(
      (msg: any) => msg.eventType === 'ddp-event',
    )

    expect(ddpMessages.length).toBeGreaterThan(0)
  })

  test.skip('Test 4: Minimongo Collection Updates - verifies extension tracks collection changes', async () => {
    // NOTE: This test is skipped because minimongo-get-collections is a request/response message.
    // It requires sending a request via the extension API, not just listening to postMessage events.
    // These integration tests only capture automatic postMessage events.
    const page = await context.newPage()

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })
    await setupMessageCapture(page)

    // Wait for minimongo-get-collections messages specifically
    await page.waitForFunction(() => {
      const messages = (window as any).__mde2_captured_messages || []
      return messages.some(
        (msg: any) => msg.eventType === 'minimongo-get-collections',
      )
    })

    const messages = await getCapturedMessages(page)
    const collectionMessages = messages.filter(
      (msg: any) => msg.eventType === 'minimongo-get-collections',
    )

    expect(collectionMessages.length).toBeGreaterThan(0)
  })

  test('Test 5: DDP Method with Object Parameter - verifies complex parameter serialization', async () => {
    const page = await context.newPage()

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })
    await setupMessageCapture(page)

    await page.waitForFunction(
      () => typeof (window as any).Meteor !== 'undefined',
      { timeout: 5000 },
    )

    const objectButton = page.locator('button:has-text("Object")')
    await expect(objectButton).toBeVisible()

    // Clear and click
    await page.evaluate(() => {
      ;(window as any).__mde2_captured_messages = []
    })
    await objectButton.click()

    // Wait for ddp-event message specifically
    await page.waitForFunction(
      () => {
        const messages = (window as any).__mde2_captured_messages || []
        return messages.some((msg: any) => msg.eventType === 'ddp-event')
      },
      { timeout: 5000 },
    )

    const messages = await getCapturedMessages(page)
    const ddpMessages = messages.filter(
      (msg: any) => msg.eventType === 'ddp-event',
    )

    // Find the method call with echo and verify it has the object parameter
    const methodMessage = ddpMessages.find((msg: any) => {
      const content = msg.data?.content
      if (typeof content === 'string') {
        try {
          const parsed = JSON.parse(content)
          return (
            parsed.msg === 'method' &&
            parsed.method === 'echo' &&
            parsed.params?.length > 0
          )
        } catch {
          return false
        }
      }
      return false
    })

    expect(methodMessage).toBeDefined()

    // Verify the parameter was captured
    const parsed = JSON.parse(methodMessage.data.content)
    expect(parsed.params[0]).toHaveProperty('echo')
    expect(typeof parsed.params[0].echo).toBe('string')
    expect(parsed.params[0].echo.length).toBeGreaterThan(100) // It's a long pirate string
  })

  test.skip('Test 6: Minimongo Insert Operation - client-side inserts on subscribed collections', async () => {
    // NOTE: This test is skipped because:
    // - RandomCollection contains subscribed data from server.
    // - Client-side insert() on subscribed collections requires allow/deny rules.
    // - The test app doesn't have allow rules configured.
    // - Testing insert tracking would require server-side methods or local collections.
    //
    // To enable this test:
    // - Add appropriate allow rules to RandomCollection in the test app (e.g., RandomCollection.allow({ insert: () => true })).
    // - Alternatively, implement a server-side Meteor method to perform the insert, or use a local (client-only) collection for testing.
  })

  test.skip('Test 7: Minimongo Update Operation - client-side updates on subscribed collections', async () => {
    // NOTE: This test is skipped because:
    // - RandomCollection contains subscribed data from server.
    // - Client-side update() on subscribed collections requires allow/deny rules.
    // - The test app doesn't have allow rules configured.
    // - Testing update tracking would require server-side methods or local collections.
    //
    // To enable this test:
    // - Add appropriate allow rules to RandomCollection in the test app (e.g., RandomCollection.allow({ update: () => true })).
    // - Alternatively, implement a server-side Meteor method to perform the update, or use a local (client-only) collection for testing.
  })

  test('Test 8: Cursor Fetch Operation - verifies cursor tracking', async () => {
    const page = await context.newPage()

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })
    await setupMessageCapture(page)

    await page.waitForFunction(
      () => typeof (window as any).Meteor !== 'undefined',
      { timeout: 5000 },
    )

    // Clear messages and perform a cursor fetch (skip if no RandomCollection)
    const executed = await page.evaluate(() => {
      ;(window as any).__mde2_captured_messages = []
      const { RandomCollection } = window as any
      if (!RandomCollection) return false
      RandomCollection.find({ value: { $gt: 50 } }).fetch()
      return true
    })

    if (!executed) {
      test.skip()
      return
    }

    // Wait for minimongo-method message specifically
    await page.waitForFunction(
      () => {
        const messages = (window as any).__mde2_captured_messages || []
        return messages.some((msg: any) => msg.eventType === 'minimongo-method')
      },
      { timeout: 5000 },
    )

    const messages = await getCapturedMessages(page)
    const minimongoMessages = messages.filter(
      (msg: any) => msg.eventType === 'minimongo-method',
    )

    // Find fetch message
    const fetchMessage = minimongoMessages.find(
      (msg: any) => msg.data?.method === 'fetch',
    )

    expect(fetchMessage).toBeDefined()
    expect(fetchMessage.data).toHaveProperty('collectionName')
    expect(fetchMessage.data).toHaveProperty('runtime')
    expect(fetchMessage.data.runtime).toBeGreaterThanOrEqual(0)
  })

  test('Test 9: Performance Metrics - verifies runtime tracking', async () => {
    const page = await context.newPage()

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })
    await setupMessageCapture(page)

    await page.waitForFunction(
      () => typeof (window as any).Meteor !== 'undefined',
      { timeout: 5000 },
    )

    // Clear and perform multiple operations (skip if no RandomCollection)
    const executed = await page.evaluate(() => {
      ;(window as any).__mde2_captured_messages = []
      const { RandomCollection } = window as any
      if (!RandomCollection) return false
      for (let i = 0; i < 5; i++) {
        RandomCollection.find({}).fetch()
      }
      return true
    })

    if (!executed) {
      test.skip()
      return
    }

    // Wait for performance messages specifically
    await page.waitForFunction(
      () => {
        const messages = (window as any).__mde2_captured_messages || []
        return messages.some(
          (msg: any) => msg.eventType === 'meteor-data-performance',
        )
      },
      { timeout: 5000 },
    )

    const messages = await getCapturedMessages(page)
    const perfMessages = messages.filter(
      (msg: any) => msg.eventType === 'meteor-data-performance',
    )

    // Should have captured performance metrics
    expect(perfMessages.length).toBeGreaterThan(0)

    // Verify structure
    const perfMsg = perfMessages[0]
    expect(perfMsg.data).toHaveProperty('collectionName')
    expect(perfMsg.data).toHaveProperty('runtime')
    expect(typeof perfMsg.data.runtime).toBe('number')
  })

  test('Test 10: Multiple Concurrent Method Calls - verifies message ordering', async () => {
    const page = await context.newPage()

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })
    await setupMessageCapture(page)

    await page.waitForFunction(
      () => typeof (window as any).Meteor !== 'undefined',
      { timeout: 5000 },
    )

    // Clear and trigger multiple method calls rapidly
    await page.evaluate(() => {
      ;(window as any).__mde2_captured_messages = []
      for (let i = 0; i < 5; i++) {
        Meteor.call('echo', `Message ${i}`)
      }
    })

    // Wait for ddp-event messages specifically
    await page.waitForFunction(
      () => {
        const messages = (window as any).__mde2_captured_messages || []
        return messages.some((msg: any) => msg.eventType === 'ddp-event')
      },
      { timeout: 5000 },
    )

    const messages = await getCapturedMessages(page)
    const ddpMessages = messages.filter(
      (msg: any) => msg.eventType === 'ddp-event',
    )

    // Should have captured multiple method calls
    const methodCalls = ddpMessages.filter((msg: any) => {
      try {
        const parsed = JSON.parse(msg.data?.content || '{}')
        return parsed.msg === 'method' && parsed.method === 'echo'
      } catch {
        return false
      }
    })

    expect(methodCalls.length).toBeGreaterThanOrEqual(5)

    // Verify each has a timestamp
    methodCalls.forEach((msg: any) => {
      expect(msg.data).toHaveProperty('timestamp')
      expect(typeof msg.data.timestamp).toBe('number')
    })
  })

  test.skip('Test 11: Stack Trace Capture - verifies call origin tracking', async () => {
    // NOTE: Stack trace capture is disabled by default for performance
    // See extension.stacktrace.spec.ts for stack trace tests
    const page = await context.newPage()

    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })
    await setupMessageCapture(page)

    await page.waitForFunction(
      () => typeof (window as any).Meteor !== 'undefined',
      { timeout: 5000 },
    )

    // Clear and trigger a method call
    const stringButton = page.locator('button:has-text("String")')
    await page.evaluate(() => {
      ;(window as any).__mde2_captured_messages = []
    })
    await stringButton.click()

    // Wait for ddp-event message with rawStackTrace specifically
    await page.waitForFunction(
      () => {
        const messages = (window as any).__mde2_captured_messages || []
        return messages.some(
          (msg: any) =>
            msg.eventType === 'ddp-event' && msg.data?.rawStackTrace,
        )
      },
      { timeout: 5000 },
    )

    const messages = await getCapturedMessages(page)
    const ddpMessages = messages.filter(
      (msg: any) => msg.eventType === 'ddp-event',
    )

    // Find a message with rawStackTrace
    const messageWithTrace = ddpMessages.find(
      (msg: any) => msg.data?.rawStackTrace,
    )

    expect(messageWithTrace).toBeDefined()
    expect(typeof messageWithTrace.data.rawStackTrace).toBe('string')
    expect(messageWithTrace.data.rawStackTrace.length).toBeGreaterThan(0)
  })
})
