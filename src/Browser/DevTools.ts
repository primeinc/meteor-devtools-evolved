import browser from 'webextension-polyfill'

// Create panel - webextension-polyfill returns a Promise (3 args), not callback (4 args)
browser.devtools.panels
  .create('☄️ Meteor', '', 'devtools-panel.html')
  .then(panel => {
    // Set up panel window access for E2E testing
    panel.onShown.addListener(panelWindow => {
      // Expose a function in the panel window to send state to background
      panelWindow.__sendStateToBackground = () => {
        // Get panel state from the window's React app
        const ddpStore = panelWindow.PanelStore?.ddpStore
        const minimongoStore = panelWindow.PanelStore?.minimongoStore

        const state = {
          ddp: {
            messageCount: ddpStore?.collection?.length || 0,
            messages: ddpStore?.collection?.slice(0, 5) || [],
          },
          minimongo: {
            collectionNames: Object.keys(minimongoStore?.collections || {}),
            queryLogCount: minimongoStore?.methodLogs?.length || 0,
          },
        }

        browser.runtime
          .sendMessage({
            type: 'PANEL_STATE',
            state,
            tabId: browser.devtools.inspectedWindow.tabId,
          })
          .catch(err => {
            console.debug('Failed to send panel state:', err)
          })
      }

      // Send initial state
      setTimeout(() => {
        panelWindow.__sendStateToBackground?.()
      }, 1000)
    })
  })

// Signal that DevTools page loaded and panel was created (for E2E tests)
// Note: Panel.tsx will send METEOR_DEV_PANEL_READY when the React app actually mounts
browser.runtime
  .sendMessage({
    type: 'DEVTOOLS_INIT_RECV',
    source: 'DevTools.ts',
    timestamp: Date.now(),
    description:
      'DevTools script loaded, panel created but iframe not yet mounted',
  })
  .catch(err => {
    console.debug(
      'DEVTOOLS_INIT_RECV signal failed (expected if not in test):',
      err,
    )
  })
