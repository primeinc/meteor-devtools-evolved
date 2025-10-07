/**
 * Cache Limits Tests
 *
 * Verifies that message caching doesn't grow unbounded:
 * - Cache size stays reasonable during normal operation
 * - Messages are properly cleared/limited per tab
 * - No memory leaks from accumulating messages
 */

import path from 'path'
import { test, expect, chromium, BrowserContext, Page } from '@playwright/test'

const EXT = path.resolve(__dirname, '../extension/chrome')
const METEOR_APP = process.env.METEOR_APP_URL || 'http://localhost:33000'

test.describe('Cache Limits', () => {
  let context: BrowserContext
  let extensionId: string
  let serviceWorker: any

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

    serviceWorker = background

    const url = background.url()
    const match = url.match(/chrome-extension:\/\/([a-p]{32})/)
    if (!match) throw new Error(`Unable to parse extension ID from ${url}`)
    extensionId = match[1]
  })

  test.afterAll(async () => {
    await context.close()
  })

  test('Cache should stay within expected bounds based on subscription count', async () => {
    // Set up listener for DEVTOOLS_INIT_RECV
    const panelReadyPromise = serviceWorker.evaluate(() => {
      return new Promise(resolve => {
        chrome.runtime.onMessage.addListener(msg => {
          if (msg.type === 'DEVTOOLS_INIT_RECV') {
            resolve(true)
          }
        })
        setTimeout(() => resolve(false), 10000)
      })
    })

    // Open test page
    const page = await context.newPage()
    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })

    // Wait for panel to register
    await panelReadyPromise

    // Wait for Meteor to initialize
    await page.waitForSelector('button:has-text("String")', {
      timeout: 10000,
    })

    // Trigger multiple DDP calls to generate messages
    for (let i = 0; i < 10; i++) {
      await page.click('button:has-text("String")')
      // Small delay to let messages flow
      await page.waitForTimeout(100)
    }

    // Wait a bit for all messages to be processed
    await page.waitForTimeout(500)

    // Query cache size
    const cacheData = await serviceWorker.evaluate(() => {
      const cache = (self as any).Cache
      const allEntries: any[] = []

      if (cache && typeof cache.forEach === 'function') {
        cache.forEach((messages: any[], tabId: number) => {
          allEntries.push({
            tabId,
            messageCount: messages.length,
          })
        })
      }

      return {
        allEntries,
        cacheSize: cache?.size || 0,
      }
    })

    console.log('Cache state after 10 DDP calls:')
    console.log(`  Tabs: ${cacheData.cacheSize}`)
    cacheData.allEntries.forEach((entry: any) => {
      console.log(`  Tab ${entry.tabId}: ${entry.messageCount} messages`)
    })

    // Verify cache doesn't have excessive messages
    const tabWithMessages = cacheData.allEntries.find(
      (e: any) => e.messageCount > 0,
    )

    expect(tabWithMessages).toBeDefined()

    // Expected message count based on devapp subscriptions:
    // - 10 RandomCollection subscriptions (100 docs each): ~1,040 messages
    // - 1 SampleCollection subscription (1 doc): ~5 messages
    // - Connection overhead: ~2 messages
    // - 10 additional DDP calls: ~20 messages
    // Total baseline: ~1,067 messages
    // Wide margin for environmental variability: 900-2,500 messages
    // Primary assertion is < 10,000 to prevent unbounded growth
    expect(tabWithMessages.messageCount).toBeGreaterThan(900)
    expect(tabWithMessages.messageCount).toBeLessThan(2500)

    // Sanity check: Should NOT hit the 10,000 message limit
    expect(tabWithMessages.messageCount).toBeLessThan(10000)
  })

  test('Cache should handle rapid message bursts without unbounded growth', async () => {
    // Set up listener for DEVTOOLS_INIT_RECV
    const panelReadyPromise = serviceWorker.evaluate(() => {
      return new Promise(resolve => {
        chrome.runtime.onMessage.addListener(msg => {
          if (msg.type === 'DEVTOOLS_INIT_RECV') {
            resolve(true)
          }
        })
        setTimeout(() => resolve(false), 10000)
      })
    })

    const page = await context.newPage()
    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })
    await panelReadyPromise

    await page.waitForSelector('button:has-text("String")', {
      timeout: 10000,
    })

    // Trigger rapid burst of 50 method calls
    await page.evaluate(() => {
      for (let i = 0; i < 50; i++) {
        Meteor.call('echo', `burst-${i}`)
      }
    })

    // Wait for messages to be processed
    await page.waitForTimeout(2000)

    // Query cache size
    const cacheData = await serviceWorker.evaluate(() => {
      const cache = (self as any).Cache
      const allEntries: any[] = []

      if (cache && typeof cache.forEach === 'function') {
        cache.forEach((messages: any[], tabId: number) => {
          allEntries.push({
            tabId,
            messageCount: messages.length,
          })
        })
      }

      return {
        allEntries,
        cacheSize: cache?.size || 0,
      }
    })

    console.log('Cache state after 50 rapid DDP calls:')
    console.log(`  Tabs: ${cacheData.cacheSize}`)
    cacheData.allEntries.forEach((entry: any) => {
      console.log(`  Tab ${entry.tabId}: ${entry.messageCount} messages`)
    })

    const tabWithMessages = cacheData.allEntries.find(
      (e: any) => e.messageCount > 0,
    )

    expect(tabWithMessages).toBeDefined()

    // Expected: baseline (~1,067) + 50 burst calls (~100 messages)
    // Wide margin for environmental variability: 1,000-2,500 messages
    // Primary assertion is < 10,000 to prevent unbounded growth
    expect(tabWithMessages.messageCount).toBeGreaterThan(1000)
    expect(tabWithMessages.messageCount).toBeLessThan(2500)

    // Sanity check: Should NOT hit the 10,000 message limit
    expect(tabWithMessages.messageCount).toBeLessThan(10000)
  })
})
