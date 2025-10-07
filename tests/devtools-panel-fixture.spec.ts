/**
 * DevTools Panel E2E Test - Fixture Pattern
 *
 * Tests the Meteor DevTools panel using reusable fixtures
 * Following Playwright best practices from the guide
 */

import { test as base, chromium, BrowserContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import path from 'path'

const EXT = path.resolve(__dirname, '../extension/chrome')

type ExtensionFixtures = {
  context: BrowserContext
  extensionId: string
  serviceWorker: any
  testPage: Page
}

// Extend base test with extension fixtures
export const test = base.extend<ExtensionFixtures>({
  context: async (_fixtures, use) => {
    // Launch browser with extension loaded
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXT}`,
        `--load-extension=${EXT}`,
        '--auto-open-devtools-for-tabs',
      ],
    })

    await use(context)
    await context.close()
  },

  extensionId: async ({ context }, use) => {
    // Get extension ID from service worker URL
    let [background] = context.serviceWorkers()
    if (!background) {
      background = await context.waitForEvent('serviceworker')
    }

    const extensionId = background.url().split('/')[2]
    console.log('Extension ID:', extensionId)

    await use(extensionId)
  },

  serviceWorker: async ({ context }, use) => {
    // Get service worker and set up console logging
    const workers = context.serviceWorkers()
    if (workers.length === 0) {
      throw new Error('No service worker found')
    }

    const serviceWorker = workers[0]
    console.log('Service worker:', serviceWorker.url())

    // Capture service worker console output
    serviceWorker.on('console', msg => {
      console.log(`[SW Console ${msg.type()}]:`, msg.text())
    })

    await use(serviceWorker)
  },

  testPage: async ({ context, serviceWorker }, use) => {
    // Set up listener for PANEL_READY
    const panelReadyPromise = serviceWorker.evaluate(() => {
      return new Promise(resolve => {
        chrome.runtime.onMessage.addListener(msg => {
          if (msg.type === 'PANEL_READY') {
            resolve(true)
          }
        })
        setTimeout(() => resolve(false), 10000)
      })
    })

    // Open test page
    const testPage = await context.newPage()

    // Capture test page console output
    testPage.on('console', msg => {
      console.log(`[Page Console ${msg.type()}]:`, msg.text())
    })

    // Navigate using baseURL from config
    await testPage.goto('/', { waitUntil: 'domcontentloaded' })
    console.log('Test page loaded')

    // Wait for panel to register
    const panelReady = await panelReadyPromise
    console.log('Panel ready:', panelReady)

    await use(testPage)
  },
})

test.describe('MDE2 DevTools Panel - Fixture Pattern', () => {
  test('Should capture DDP messages in background cache', async ({
    testPage,
    serviceWorker,
  }) => {
    // Wait for Meteor to initialize
    await testPage.waitForSelector('button:has-text("String")', {
      timeout: 10000,
    })
    console.log('Meteor app ready')

    // Trigger DDP activity
    console.log('Clicking String button to trigger Meteor.call()...')
    await testPage.click('button:has-text("String")')
    await testPage.waitForTimeout(2000)

    // Query background service worker Cache for DDP messages
    const cacheData = await serviceWorker.evaluate(() => {
      const cache = (self as any).Cache
      console.log('Cache Map has', cache?.size, 'entries')

      // Get all entries from Cache
      const allEntries: any[] = []
      if (cache && typeof cache.forEach === 'function') {
        cache.forEach((messages: any[], tabId: number) => {
          allEntries.push({
            tabId,
            messageCount: messages.length,
            messages: messages.slice(0, 5), // First 5 messages
          })
        })
      }

      return {
        allEntries,
        cacheSize: cache?.size || 0,
      }
    })

    console.log('Cache data:', JSON.stringify(cacheData, null, 2))
    console.log(
      'Tabs with cached messages:',
      cacheData.allEntries.map(
        (e: any) => `Tab ${e.tabId}: ${e.messageCount} messages`,
      ),
    )

    // Verify we have cached messages
    expect(cacheData.allEntries.length).toBeGreaterThan(0)

    // Verify DDP messages were captured
    const tabWithMessages = cacheData.allEntries.find(
      (e: any) => e.messageCount > 0,
    )
    expect(tabWithMessages).toBeDefined()
    expect(tabWithMessages.messageCount).toBeGreaterThan(0)

    // Verify message structure
    expect(tabWithMessages.messages.length).toBeGreaterThan(0)
    const firstMessage = tabWithMessages.messages[0]
    expect(firstMessage).toHaveProperty('eventType')
    expect(firstMessage.eventType).toBe('ddp-event')
  })

  test('Should capture multiple DDP calls', async ({
    testPage,
    serviceWorker,
  }) => {
    await testPage.waitForSelector('button:has-text("String")', {
      timeout: 10000,
    })

    // Trigger multiple method calls
    for (let i = 0; i < 3; i++) {
      await testPage.click('button:has-text("String")')
      await testPage.waitForTimeout(500)
    }

    await testPage.waitForTimeout(1000)

    const cacheData = await serviceWorker.evaluate(() => {
      const cache = (self as any).Cache
      const allEntries: any[] = []

      if (cache && typeof cache.forEach === 'function') {
        cache.forEach((messages: any[], tabId: number) => {
          const ddpMessages = messages.filter(
            (m: any) => m.eventType === 'ddp-event',
          )
          allEntries.push({
            tabId,
            ddpMessageCount: ddpMessages.length,
          })
        })
      }

      return { allEntries }
    })

    const tabWithMessages = cacheData.allEntries.find(
      (e: any) => e.ddpMessageCount > 0,
    )
    expect(tabWithMessages).toBeDefined()
    // Should have at least 6 DDP messages (3 method calls = 3 request + 3 response minimum)
    expect(tabWithMessages.ddpMessageCount).toBeGreaterThanOrEqual(6)
  })
})
