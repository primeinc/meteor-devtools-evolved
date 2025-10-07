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
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
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
    let [serviceWorker] = context.serviceWorkers()
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker')
    }

    console.log('Service worker:', serviceWorker.url())

    // Capture service worker console output
    serviceWorker.on('console', msg => {
      console.log(`[SW Console ${msg.type()}]:`, msg.text())
    })

    await use(serviceWorker)
  },

  testPage: async ({ context, serviceWorker }, use) => {
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

    // Set up listener for DDP messages before triggering activity
    const messageReceivedPromise = serviceWorker.evaluate(() => {
      return new Promise<void>(resolve => {
        const listener = (message: any) => {
          if (
            message.source === 'meteor-devtools-evolved' &&
            message.eventType === 'ddp-event'
          ) {
            chrome.runtime.onMessage.removeListener(listener)
            resolve()
          }
        }
        chrome.runtime.onMessage.addListener(listener)
        // Safety timeout
        setTimeout(() => resolve(), 5000)
      })
    })

    // Trigger DDP activity
    console.log('Clicking String button to trigger Meteor.call()...')
    await testPage.click('button:has-text("String")')

    // Wait for message to arrive
    await messageReceivedPromise

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
            messages: messages.slice(0, 1), // Just first message as sample
          })
        })
      }

      return {
        allEntries,
        cacheSize: cache?.size || 0,
      }
    })

    console.log(
      'Cache:',
      `${cacheData.cacheSize} tabs,`,
      cacheData.allEntries.map((e: any) => `${e.messageCount} msgs`).join(', '),
    )
    console.log(
      'Tabs with cached messages:',
      cacheData.allEntries.map(
        (e: any) => `Tab ${e.tabId}: ${e.messageCount} messages`,
      ),
    )
    console.log(
      'Sample messages:',
      cacheData.allEntries
        .filter((e: any) => e.messages.length > 0)
        .map((e: any) => JSON.stringify(e.messages[0]))
        .join('\n'),
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
    }

    // Wait for all 6 messages (3 requests + 3 responses) to arrive
    await serviceWorker.evaluate(() => {
      return new Promise<void>(resolve => {
        const checkMessages = () => {
          const cache = (self as any).Cache
          if (!cache) return

          let maxCount = 0
          cache.forEach((messages: any[], tabId: number) => {
            const ddpMessages = messages.filter(
              (m: any) => m.eventType === 'ddp-event',
            )
            if (ddpMessages.length > maxCount) {
              maxCount = ddpMessages.length
            }
          })

          if (maxCount >= 6) {
            resolve()
          } else {
            setTimeout(checkMessages, 100)
          }
        }
        checkMessages()
        // Fail after 5 seconds
        setTimeout(() => resolve(), 5000)
      })
    })

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
