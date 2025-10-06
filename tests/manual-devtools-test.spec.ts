/**
 * Manual DevTools Panel Test
 *
 * This test opens the actual DevTools panel and verifies the extension loaded
 */

import { test, expect, chromium } from '@playwright/test'
import path from 'path'

const EXT = path.resolve(__dirname, '../extension/chrome')
const METEOR_APP = process.env.METEOR_APP_URL || 'http://localhost:33000'

test.describe('Manual DevTools Panel Test', () => {
  test('Can open DevTools and click Meteor panel', async () => {
    // Launch browser directly to METEOR_APP with devtools auto-open
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXT}`,
        `--load-extension=${EXT}`,
        '--auto-open-devtools-for-tabs',
        `--app=${METEOR_APP}`, // Open directly to Meteor app, no about:blank
      ],
    })

    // Get the service worker
    const [serviceWorker] = context.serviceWorkers()
    if (!serviceWorker) {
      throw new Error('No service worker found')
    }
    console.log('Service worker URL:', serviceWorker.url())

    // Set up message listener in service worker to capture PANEL_READY
    const panelReadyPromise = serviceWorker.evaluate(() => {
      return new Promise(resolve => {
        chrome.runtime.onMessage.addListener(msg => {
          if (msg.type === 'PANEL_READY') {
            console.log('✅ PANEL_READY received in background!')
            resolve(true)
          }
        })
        // Timeout after 10 seconds
        setTimeout(() => resolve(false), 10000)
      })
    })

    // Get the page (should already be open to METEOR_APP)
    const pages = context.pages()
    console.log(`Found ${pages.length} pages`)
    const page = pages.find(p => p.url().includes('localhost:33000'))
    if (!page) {
      throw new Error('Meteor app page not found')
    }
    console.log('Meteor app page URL:', page.url())

    // Set up listener for devtools:// page
    const devtoolsPagePromise = context
      .waitForEvent(
        'page',
        p => {
          console.log('Page event:', p.url())
          return p.url().startsWith('devtools://')
        },
        { timeout: 15000 },
      )
      .catch(() => null)

    // Wait for PANEL_READY signal and devtools page
    console.log('Waiting for panel registration...')
    const panelReady = await panelReadyPromise
    console.log('Panel ready?', panelReady)

    // Set up message capture BEFORE triggering actions
    await page.evaluate(() => {
      ;(window as any).__test_captured_messages = []
      window.addEventListener('message', event => {
        if (event.data?.source === 'meteor-devtools-evolved') {
          ;(window as any).__test_captured_messages.push({
            eventType: event.data.eventType,
            timestamp: Date.now(),
          })
        }
      })
    })

    // Wait for page to fully load with buttons visible
    console.log('Waiting for Meteor app buttons...')
    await page.waitForSelector('button:has-text("String")', { timeout: 10000 })

    // Click the String button to trigger Meteor.call()
    console.log('Clicking String button...')
    await page.click('button:has-text("String")')
    await page.waitForTimeout(1000)

    // Check if DDP messages were sent
    const capturedMessages = await page.evaluate(() => {
      return (window as any).__test_captured_messages || []
    })
    console.log(`Captured ${capturedMessages.length} postMessage events`)

    // Try to get devtools page
    const devtoolsPage = await devtoolsPagePromise

    if (devtoolsPage) {
      console.log('✅ DevTools page found:', devtoolsPage.url())
      await devtoolsPage.waitForLoadState('domcontentloaded')

      // Look for Meteor tab
      const meteorTab = devtoolsPage.locator('[aria-label*="Meteor"]')
      if ((await meteorTab.count()) > 0) {
        console.log('Clicking Meteor tab...')
        await meteorTab.first().click()
        await devtoolsPage.waitForTimeout(1000)
      }

      // Look for panel iframe
      const frames = devtoolsPage.frames()
      console.log(`DevTools has ${frames.length} frames`)
      for (const frame of frames) {
        if (frame.url().includes('devtools-panel.html')) {
          console.log('✅ Found panel iframe!')
          const ddpState = await frame.evaluate(() => {
            return {
              ddpElementExists: !!document.querySelector('.mde-ddp'),
            }
          })
          console.log('Panel state:', ddpState)
        }
      }
    } else {
      console.log('❌ DevTools page not accessible via Playwright')
      console.log('Opening browser for manual verification...')
    }

    await page.waitForTimeout(45000)

    await context.close()
  })
})
