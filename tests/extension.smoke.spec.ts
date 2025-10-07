/**
 * Extension Smoke Test
 *
 * Verifies:
 * - Extension loads in Chromium
 * - MV3 service worker boots
 * - Message passing works between contexts
 *
 * This catches packaging, permissions, and MV3 lifecycle issues
 * that unit tests cannot detect.
 */

import path from 'path'
import { test, expect, chromium, BrowserContext } from '@playwright/test'

const EXT = path.resolve(__dirname, '../extension/chrome')
const METEOR_APP = process.env.METEOR_APP_URL || 'http://localhost:33000'

test.describe('MV3 Extension Smoke Test', () => {
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

    // Service worker boots during context creation - get it synchronously
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

  test('worker responds to PING from extension page', async () => {
    // Navigate to extension page (popup.html has chrome.runtime API)
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
    })

    // Round-trip PING message to service worker
    const pong = await page.evaluate(
      () =>
        new Promise(res => chrome.runtime.sendMessage({ type: 'PING' }, res)),
    )
    expect(pong).toEqual({ type: 'PONG' })
  })

  test('service worker is running', async () => {
    const serviceWorkers = context.serviceWorkers()
    expect(serviceWorkers.length).toBeGreaterThan(0)

    const swUrl = serviceWorkers[0].url()
    expect(swUrl).toContain('chrome-extension://')
    expect(swUrl).toContain('background.js')
  })

  test('DevTools panel boots and signals ready', async () => {
    // Set up listener for DEVTOOLS_INIT_RECV in service worker BEFORE opening page
    const sw = context.serviceWorkers()[0]
    const readyPromise = sw.evaluate(
      () =>
        new Promise<boolean>(resolve => {
          const timer = setTimeout(() => {
            console.log('DEVTOOLS_INIT_RECV timeout after 10s')
            resolve(false)
          }, 10000)
          chrome.runtime.onMessage.addListener(function onMsg(msg) {
            console.log('Service worker received message:', msg)
            if (msg?.type === 'DEVTOOLS_INIT_RECV') {
              console.log('DEVTOOLS_INIT_RECV received!')
              clearTimeout(timer)
              chrome.runtime.onMessage.removeListener(onMsg)
              resolve(true)
            }
          })
          console.log('Service worker listening for DEVTOOLS_INIT_RECV...')
        }),
    )

    // Open Meteor app - DevTools will auto-open due to --auto-open-devtools-for-tabs
    const page = await context.newPage()
    await page.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })

    // Give DevTools and panel time to mount

    // Wait for DEVTOOLS_INIT_RECV signal
    const sawReady = await readyPromise
    expect(sawReady).toBeTruthy()
  })
})
