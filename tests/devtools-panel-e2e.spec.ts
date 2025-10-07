/**
 * DevTools Panel E2E Test
 *
 * Tests the Meteor DevTools panel via background service worker communication
 * Strategy: Panel sends state to background → Test queries background
 */

import { test, expect, chromium, BrowserContext, Page } from '@playwright/test'
import path from 'path'

const METEOR_APP = 'http://localhost:33000'
const EXT = path.resolve(__dirname, '../extension/chrome')

let context: BrowserContext
let testPage: Page
let serviceWorker: any

test.describe.configure({ mode: 'serial', retries: 0 })

test.beforeAll(async () => {
  // Launch browser with extension
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--auto-open-devtools-for-tabs',
    ],
  })

  // Get service worker
  let [background] = context.serviceWorkers()
  if (!background) {
    background = await context.waitForEvent('serviceworker')
  }
  serviceWorker = background
  console.log('Service worker:', serviceWorker.url())

  // Capture service worker console output
  serviceWorker.on('console', msg => {
    console.log(`[SW Console ${msg.type()}]:`, msg.text())
  })

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
  testPage = await context.newPage()

  // Capture test page console output
  testPage.on('console', msg => {
    console.log(`[Page Console ${msg.type()}]:`, msg.text())
  })

  await testPage.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })
  console.log('Test page loaded:', METEOR_APP)

  // Wait for panel to register
  const panelReady = await panelReadyPromise
  console.log('Panel ready:', panelReady)

  // Debug: List all pages in context
  const allPages = context.pages()
  console.log('Total pages:', allPages.length)
  for (let i = 0; i < allPages.length; i++) {
    console.log(`Page ${i}: ${allPages[i].url()}`)
  }
})

test.afterAll(async () => {
  await context.close()
})

test('Should capture DDP messages in background cache', async () => {
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

  console.log('Cache data from background:', JSON.stringify(cacheData, null, 2))
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
