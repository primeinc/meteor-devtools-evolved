import browser from 'webextension-polyfill'
import { checkFirefoxBrowser } from '@/Utils'

const isFirefox = checkFirefoxBrowser()

browser.devtools.panels.create(
  `${isFirefox ? '' : '☄️'} Meteor`,
  '',
  'devtools-panel.html',
  (panel) => {
    // Set up panel window access for E2E testing
    panel.onShown.addListener((panelWindow) => {
      // Expose a function in the panel window to send state to background
      panelWindow.__sendStateToBackground = () => {
        // Get panel state from the window's React app
        const ddpStore = panelWindow.PanelStore?.ddpStore
        const minimongoStore = panelWindow.PanelStore?.minimongoStore

        const state = {
          ddp: {
            messageCount: ddpStore?.collection?.length || 0,
            messages: ddpStore?.collection?.slice(0, 5) || []
          },
          minimongo: {
            collectionNames: Object.keys(minimongoStore?.collections || {}),
            queryLogCount: minimongoStore?.methodLogs?.length || 0
          }
        }

        browser.runtime.sendMessage({
          type: 'PANEL_STATE',
          state,
          tabId: browser.devtools.inspectedWindow.tabId
        }).catch(err => {
          console.debug('Failed to send panel state:', err)
        })
      }

      // Send initial state
      setTimeout(() => {
        panelWindow.__sendStateToBackground?.()
      }, 1000)
    })
  }
)

// Signal that DevTools page loaded and panel was registered (for E2E tests)
browser.runtime.sendMessage({ type: 'PANEL_READY' }).catch(err => {
  console.debug('PANEL_READY signal failed (expected if not in test):', err)
})
