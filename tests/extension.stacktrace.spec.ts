/**
 * Stack Trace Capture Tests
 *
 * Verifies that stack trace capture:
 * - Is OFF by default (performance)
 * - Can be explicitly enabled via settings
 * - Produces valid stack traces when enabled
 */

import path from 'path'
import { test, expect, chromium, BrowserContext, Page } from '@playwright/test'

const EXT = path.resolve(__dirname, '../extension/chrome')
const METEOR_APP = process.env.METEOR_APP_URL || 'http://localhost:33000'

test.describe('Stack Trace Capture', () => {
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
   */
  async function setupMessageCapture(page: Page) {
    await page.evaluate(() => {
      ;(window as any).__mde2_captured_messages = []
      window.addEventListener('message', event => {
        if (event.data?.source === 'meteor-devtools-evolved') {
          ;(window as any).__mde2_captured_messages.push(event.data)
        }
      })
    })
  }

  /**
   * Helper: Get captured messages
   */
  async function getCapturedMessages(page: Page) {
    return await page.evaluate(() => {
      return (window as any).__mde2_captured_messages || []
    })
  }

  test('Stack traces should be OFF by default (rawStackTrace should be null)', async () => {
    const page = await context.newPage()
    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })
    await setupMessageCapture(page)

    await page.waitForFunction(
      () => typeof (window as any).Meteor !== 'undefined',
      { timeout: 5000 },
    )

    // Clear messages and trigger a DDP call
    await page.evaluate(() => {
      ;(window as any).__mde2_captured_messages = []
    })

    const stringButton = page.locator('button:has-text("String")')
    await expect(stringButton).toBeVisible()
    await stringButton.click()

    // Wait for ddp-event message
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

    expect(ddpMessages.length).toBeGreaterThan(0)

    // Check that rawStackTrace is null/undefined by default
    ddpMessages.forEach((msg: any) => {
      expect(msg.data.rawStackTrace).toBeNull()
    })
  })

  test.skip('Stack traces can be explicitly enabled via settings', async () => {
    // TODO: Implement settings mechanism to enable stack traces
    // This test will pass once we add a setting to control stack trace capture
  })

  test.skip('Stack traces produce valid output when enabled', async () => {
    // TODO: Test that when stack traces are enabled:
    // - rawStackTrace is a non-empty string
    // - rawStackTrace does NOT start with "Error\n"
    // - rawStackTrace contains actual stack frames
  })
})
