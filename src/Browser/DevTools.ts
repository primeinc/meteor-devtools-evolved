import browser from 'webextension-polyfill'
import { checkFirefoxBrowser } from '@/Utils'

const isFirefox = checkFirefoxBrowser()

browser.devtools.panels.create(
  `${isFirefox ? '' : '☄️'} Meteor`,
  '',
  'devtools-panel.html',
)

// Signal that DevTools page loaded and panel was registered (for E2E tests)
browser.runtime.sendMessage({ type: 'PANEL_READY' }).catch(err => {
  console.debug('PANEL_READY signal failed (expected if not in test):', err)
})
