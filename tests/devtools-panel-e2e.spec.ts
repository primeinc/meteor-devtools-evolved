/**
 * DevTools Panel E2E Test
 *
 * Tests the Meteor DevTools panel UI and functionality
 * Based on Chrome Extensions DevTools testing guide
 */

import {
  test,
  expect,
  type Page,
  chromium,
  BrowserContext,
} from '@playwright/test'
import path from 'path'

const METEOR_APP = 'http://localhost:33000'
const EXT = path.resolve(__dirname, '../extension/chrome')

let context: BrowserContext
let devtoolsPage: Page
let testPage: Page

test.describe.configure({ mode: 'serial', retries: 0 })

test.beforeAll(async () => {
  // Launch context first
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--auto-open-devtools-for-tabs',
    ],
  })

  console.log('Context launched. Checking for existing pages...')
  await context.pages()[0].waitForLoadState('domcontentloaded')
  await context.pages()[0].waitForTimeout(2000)

  // List all pages
  const allPages = context.pages()
  console.log(`Found ${allPages.length} pages:`)
  for (const p of allPages) {
    console.log(`  - ${p.url()}`)
  }

  // Find devtools:// page in existing pages
  devtoolsPage = allPages.find(p => p.url().startsWith('devtools://')) as Page
  testPage = allPages.find(p => !p.url().startsWith('devtools://')) as Page

  if (!devtoolsPage) {
    throw new Error('DevTools page not found in context.pages()')
  }

  console.log('✅ DevTools page:', devtoolsPage.url())
  console.log('✅ Test page:', testPage.url())

  // Navigate test page to Meteor app
  await testPage.goto(METEOR_APP, { waitUntil: 'domcontentloaded' })
  console.log('Test page navigated to:', METEOR_APP)
})

test.afterAll(async () => {
  await context.close()
})

test('Should display DDP messages in panel', async () => {
  // Wait for Meteor to initialize
  await testPage.waitForSelector('button:has-text("String")', {
    timeout: 10000,
  })
  console.log('Meteor app ready')

  // Click the Meteor tab in DevTools
  console.log('Looking for Meteor tab...')
  const meteorTab = devtoolsPage.locator('[aria-label*="Meteor"]')
  await meteorTab.first().click()
  console.log('✅ Clicked Meteor tab')

  // Wait for the panel iframe to load
  console.log('Looking for panel iframe...')
  const panelFrameLocator = devtoolsPage.frameLocator(
    'iframe[src*="devtools-panel.html"]',
  )
  await panelFrameLocator
    .locator('.mde-ddp')
    .waitFor({ state: 'visible', timeout: 5000 })
  console.log('✅ Panel iframe loaded')

  // Click DDP tab in the panel
  await panelFrameLocator.getByRole('button', { name: 'DDP' }).click()
  console.log('✅ Clicked DDP tab in panel')

  // Trigger a Meteor call on the test page
  console.log('Triggering Meteor.call()...')
  await testPage.click('button:has-text("String")')
  await testPage.waitForTimeout(1000)

  // Find the actual iframe frame to evaluate in it
  const panelFrame = devtoolsPage
    .frames()
    .find(f => f.url().includes('devtools-panel.html'))
  if (!panelFrame) {
    throw new Error('Panel iframe not found in frames')
  }

  // Check if DDP messages appear in the panel
  const ddpState = await panelFrame.evaluate(() => {
    const ddpElement = document.querySelector('.mde-ddp')
    const messageRows = document.querySelectorAll('.mde-ddp > div')
    return {
      ddpElementExists: !!ddpElement,
      messageCount: messageRows.length,
      innerHTML: ddpElement?.innerHTML.substring(0, 300) || '',
    }
  })

  console.log('DDP Panel state:', JSON.stringify(ddpState, null, 2))
  expect(ddpState.ddpElementExists).toBe(true)
  expect(ddpState.messageCount).toBeGreaterThan(0)
})
