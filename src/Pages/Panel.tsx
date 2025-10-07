import { PanelStoreProvider, usePanelStore } from '@/Stores/PanelStore'
import { observer } from 'mobx-react-lite'
import React, { FunctionComponent, useEffect, useRef } from 'react'
import browser from 'webextension-polyfill'
import { Bookmarks } from './Panel/Bookmarks/Bookmarks'
import { DDP } from './Panel/DDP/DDP'
import { DrawerJSON } from './Panel/DrawerJSON'
import { DrawerStackTrace } from './Panel/DrawerStackTrace'
import { Minimongo } from './Panel/Minimongo/Minimongo'
import { QueryLog } from './Panel/QueryLog/QueryLog'
import { Navigation } from './Panel/Navigation'
import { Bridge } from '@/Bridge'
import { PanelPage } from '@/Constants'
import { Subscriptions } from '@/Pages/Panel/Subscriptions/Subscriptions'
import styled from 'styled-components'
import {
  MIN_LAYOUT_WIDTH,
  NAVBAR_HEIGHT,
  STATUS_HEIGHT,
} from '@/Styles/Constants'
import { Performance } from '@/Pages/Panel/Performance/Performance'
import { useAnalytics } from '@/Utils/Hooks/useAnalytics'
import { HelpDrawer } from './Panel/HelpDrawer'

// Initialize Bridge with error handling
try {
  Bridge.init()
} catch (error) {
  console.error('Bridge initialization failed:', error)
  // Show error in UI
  document.body.innerHTML = `
    <div style="padding:20px;background:#ff4444;color:white;font-family:monospace">
      <h2>Bridge Init Failed</h2>
      <pre>${error}</pre>
    </div>
  `
}

const Layout = styled.div`
  display: flex;
  flex-direction: column;

  position: relative;

  padding-top: ${NAVBAR_HEIGHT}px;
  padding-bottom: ${STATUS_HEIGHT}px;
  max-height: 100vh;

  min-width: ${MIN_LAYOUT_WIDTH}px;

  .mde-navbar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }

  .mde-layout__tab-panel {
    position: relative;

    .mde-content {
      height: calc(100vh - ${NAVBAR_HEIGHT + STATUS_HEIGHT}px);
      padding: 0;
      overflow: hidden;
    }
  }
`

const PanelObserverComponent: FunctionComponent = observer(() => {
  const store = usePanelStore()
  const panelRef = useRef<HTMLDivElement>(null)
  const analytics = useAnalytics()

  useEffect(() => {
    // eslint-disable-next-line no-console
    analytics?.pageView().catch(console.error)
  }, [analytics])

  // Send PANEL_READY signal and expose state for E2E tests
  // This effect runs once on mount - the store instance is stable and won't change
  useEffect(() => {
    // Expose PanelStore to window for E2E test access
    ;(window as any).PanelStore = store

    // Send METEOR_DEV_PANEL_READY signal
    browser.runtime
      .sendMessage({
        type: 'METEOR_DEV_PANEL_READY',
        source: 'Panel.tsx',
        timestamp: Date.now(),
        description:
          'React panel mounted, stores initialized, ready to receive data',
      })
      .catch(err => {
        console.debug(
          'METEOR_DEV_PANEL_READY signal failed (expected if not in test):',
          err,
        )
      })

    // Wait for stores to initialize, then send initial panel state
    const sendPanelState = () => {
      try {
        const state = {
          ddp: {
            messageCount: store.ddpStore?.collection?.length || 0,
            messages: store.ddpStore?.collection?.slice(0, 5) || [],
          },
          minimongo: {
            collectionNames: Object.keys(
              store.minimongoStore?.collections || {},
            ),
            queryLogCount: store.minimongoStore?.methodLogs?.length || 0,
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
      } catch (err) {
        console.debug('Error sending panel state:', err)
      }
    }

    // Send initial state after a short delay to allow stores to initialize
    const initialTimer = setTimeout(sendPanelState, 1000)

    // Set up periodic state updates for E2E tests
    const interval = setInterval(sendPanelState, 2000)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Layout>
      <DrawerJSON
        title={store.activeObjectTitle}
        viewableObject={store.activeObject}
        onClose={() => {
          store.setActiveObject(null, null)
        }}
      />

      <DrawerStackTrace
        activeStackTrace={store.activeStackTrace}
        onClose={() => store.setActiveStackTrace(null)}
      />

      <HelpDrawer
        isHelpDrawerVisible={store.isHelpDrawerVisible}
        onClose={() => store.setHelpDrawerVisible(false)}
      />

      <Navigation />

      <div className='mde-layout__tab-panel' ref={panelRef}>
        <DDP isVisible={store.selectedTabId === PanelPage.DDP} />
        <Bookmarks isVisible={store.selectedTabId === PanelPage.BOOKMARKS} />
        <Minimongo isVisible={store.selectedTabId === PanelPage.MINIMONGO} />
        <QueryLog isVisible={store.selectedTabId === PanelPage.QUERYLOG} />
        <Performance
          isVisible={store.selectedTabId === PanelPage.PERFORMANCE}
        />
        <Subscriptions
          isVisible={store.selectedTabId === PanelPage.SUBSCRIPTIONS}
        />
      </div>
    </Layout>
  )
})

export const Panel = () => (
  <PanelStoreProvider>
    <PanelObserverComponent />
  </PanelStoreProvider>
)
