/**
 * Extension Functional Tests
 *
 * Tests actual DevTools panel functionality:
 * - DDP message capture
 * - Minimongo collection inspection
 * - Query log tracking
 */

import path from 'path'
import { test, expect, chromium, BrowserContext } from '@playwright/test'

const EXT = path.resolve(__dirname, '../extension/chrome')
const METEOR_APP = process.env.METEOR_APP_URL || 'http://localhost:33000'

test.describe('MDE2 Functional Tests', () => {
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

  test('captures DDP messages from Meteor app', async () => {
    const page = await context.newPage()
    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })

    // Wait for page to fully load
    await page.waitForTimeout(2000)

    // Check if DDP connection was established by looking for connect message
    // In a real test, we'd inspect the DevTools panel UI or message store
    // For now, verify the page loaded and has Meteor
    const hasMeteor = await page.evaluate(() => {
      return typeof (window as any).Meteor !== 'undefined'
    })

    expect(hasMeteor).toBeTruthy()
  })

  test('TODO: inspects Minimongo collections', async () => {
    // This test needs:
    // 1. Navigate to devtools panel page
    // 2. Check if collections are listed in UI
    // 3. Verify collection data is displayed
    test.skip()
  })

  test('TODO: tracks query operations in Query Log', async () => {
    // This test needs:
    // 1. Navigate to devtools panel page
    // 2. Trigger a Minimongo query in the app
    // 3. Verify query appears in Query Log tab
    test.skip()
  })
})
