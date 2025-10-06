/**
 * Test Fixtures for Extension Testing
 *
 * Provides reusable fixtures for Playwright tests that handle:
 * - Browser context with extension loaded
 * - Extension ID retrieval
 * - Service worker access
 *
 * Based on: "A Definitive Guide to Automating Chrome DevTools and Extensions"
 * Section 4: "Encapsulate logic within custom Playwright test fixtures"
 * This approach "promotes code reuse and separates environmental setup from test logic"
 */

import {
  test as base,
  chromium,
  type BrowserContext,
  type Worker,
} from '@playwright/test'
import path from 'path'

type ExtensionFixtures = {
  context: BrowserContext
  extensionId: string
  serviceWorker: Worker
}

export const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const pathToExtension = path.join(__dirname, '../extension/chrome')

    // Using empty string for userDataDir creates a temporary directory
    const context = await chromium.launchPersistentContext('', {
      headless: false, // Extensions require headed mode
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--auto-open-devtools-for-tabs',
      ],
    })

    await use(context)
    await context.close()
  },

  extensionId: async ({ context }, use) => {
    // For Manifest V3 extensions, get ID from service worker URL
    let serviceWorker = context.serviceWorkers()[0]

    // Wait for service worker if not immediately available
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker')
    }

    // Extract extension ID from chrome-extension://[ID]/ URL format
    const extensionIdMatch = serviceWorker
      .url()
      .match(/chrome-extension:\/\/([a-p]{32})/)

    if (!extensionIdMatch) {
      throw new Error(
        `Failed to extract extension ID from URL: ${serviceWorker.url()}`,
      )
    }

    const extensionId = extensionIdMatch[1]
    await use(extensionId)
  },

  serviceWorker: async ({ context }, use) => {
    let serviceWorker = context.serviceWorkers()[0]

    // Wait for service worker if not immediately available
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker')
    }

    // Verify it's our extension's service worker
    if (!serviceWorker.url().includes('chrome-extension://')) {
      throw new Error(
        'Expected service worker URL to be a chrome-extension:// URL',
      )
    }

    await use(serviceWorker)
  },
})

export { expect } from '@playwright/test'

/**
 * Helper: Meteor app URL from environment or default
 */
export const METEOR_APP = process.env.METEOR_APP_URL || 'http://localhost:33000'

/**
 * Helper: Wait for Meteor to be available on page
 */
export async function waitForMeteor(page: any, timeout = 5000) {
  await page.waitForFunction(
    () => {
      return typeof (window as any).Meteor !== 'undefined'
    },
    { timeout },
  )
}

/**
 * Helper: Set up message capture on a page
 * Returns a function to retrieve captured messages
 */
export async function setupMessageCapture(page: any) {
  await page.evaluate(() => {
    ;(window as any).__mde2_test_messages = []
    window.addEventListener('message', event => {
      if (event.data?.source === 'meteor-devtools-evolved') {
        ;(window as any).__mde2_test_messages.push(event.data)
      }
    })
  })

  return async () => {
    return await page.evaluate(() => {
      return (window as any).__mde2_test_messages || []
    })
  }
}

/**
 * Helper: Trigger a DDP method call and wait for it
 */
export async function triggerMeteorCall(
  page: any,
  method: string,
  ...params: any[]
) {
  return await page.evaluate(
    ({ method, params }) => {
      return new Promise((resolve, reject) => {
        Meteor.call(method, ...params, (error: any, result: any) => {
          if (error) {
            reject(error)
          } else {
            resolve(result)
          }
        })
      })
    },
    { method, params },
  )
}

/**
 * Helper: Perform a Minimongo query
 */
export async function queryMinimongo(
  page: any,
  collectionName: string,
  selector: any = {},
) {
  return await page.evaluate(
    ({ collectionName, selector }) => {
      const collection = (window as any)[collectionName]
      if (!collection) {
        throw new Error(`Collection ${collectionName} not found`)
      }
      return collection.find(selector).fetch()
    },
    { collectionName, selector },
  )
}
