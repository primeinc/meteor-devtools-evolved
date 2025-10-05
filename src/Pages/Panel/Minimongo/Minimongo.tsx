import { MinimongoNavigator } from '@/Pages/Panel/Minimongo/MinimongoNavigator'
import { usePanelStore } from '@/Stores/PanelStore'
import { Hideable } from '@/Utils/Hideable'
import { observer } from 'mobx-react-lite'
import React, { FunctionComponent, useState } from 'react'
import { MinimongoContainer } from '@/Pages/Panel/Minimongo/MinimongoContainer'
import styled from 'styled-components'
import { MinimongoStatus } from '@/Pages/Panel/Minimongo/MinimongoStatus'
import { Button } from '@/Components/Button'
import prettyBytes from 'pretty-bytes'
import { ExportDialog } from '@/Pages/Panel/Minimongo/components/ExportDialog'
import { QueryLogList } from '@/Pages/Panel/Minimongo/components/QueryLogList'
import { Tabs, Tab } from '@blueprintjs/core'

interface Props {
  isVisible: boolean
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;

  .tabs-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .content-wrapper {
    display: flex;
    flex-direction: row;
    flex: 1;
    min-height: 0;
  }

  .sidebar {
    display: flex;
    height: 100%;
    width: 222px;
    overflow-y: auto;
    font-size: 11px;
    font-family: monospace;

    nav {
      display: flex;
      flex: 1;
      flex-direction: column;
      width: 100%;

      button {
        flex: 0 0 20px;
        width: 100%;

        &.active {
          background: rgba(255, 255, 255, 0.15);
        }

        &:hover:not(.active) {
          background: rgba(255, 255, 255, 0.1);
        }
      }
    }
  }

  .container {
    height: 100%;
    min-width: 0;
    flex-grow: 1;
    flex-shrink: 1;

    .row {
      display: flex;
      align-items: center;
      padding: 5px 15px;

      & > * + * {
        margin-left: 8px;
      }
    }
  }
`

export const Minimongo: FunctionComponent<Props> = observer(({ isVisible }) => {
  const { minimongoStore } = usePanelStore()
  const [activeTab, setActiveTab] = useState<'collections' | 'queries'>('collections')

  const isActiveCollectionMissing =
    minimongoStore.activeCollection &&
    !(minimongoStore.activeCollection in minimongoStore.collections)

  if (isActiveCollectionMissing) {
    minimongoStore.setActiveCollection(null)
  }

  return (
    <Hideable isVisible={isVisible}>
      <div className={'mde-content'}>
        <Wrapper>
          <Tabs
            id="minimongo-tabs"
            selectedTabId={activeTab}
            onChange={(newTabId) => setActiveTab(newTabId as 'collections' | 'queries')}
            className="tabs-container"
          >
            <Tab 
              id="collections" 
              title="Collections"
              panel={
                <div className="content-wrapper">
                  <div className='sidebar'>
                    <nav>
                      {!!minimongoStore.collectionNames.length &&
                        minimongoStore.collectionNames.map(key => (
                          <Button
                            key={key}
                            active={minimongoStore.activeCollection === key}
                            onClick={() => minimongoStore.setActiveCollection(key)}
                            subtitle={`${
                              minimongoStore.getMetadata(key)?.collectionSizePretty
                            } (${minimongoStore.collections[key]?.length ?? 0})`}
                            title={key}
                          >
                            {key}
                          </Button>
                        ))}

                      <Button
                        active={!minimongoStore.activeCollection}
                        onClick={() => minimongoStore.setActiveCollection(null)}
                        subtitle={`${prettyBytes(minimongoStore.totalSize)} (${
                          minimongoStore.totalDocuments
                        })`}
                      >
                        All Documents
                      </Button>
                    </nav>
                  </div>
                  <MinimongoContainer isVisible={isVisible} />
                </div>
              }
            />
            <Tab 
              id="queries" 
              title="Query Log"
              panel={<QueryLogList />}
            />
          </Tabs>
        </Wrapper>
      </div>

      <MinimongoStatus />

      <MinimongoNavigator />

      {minimongoStore.isExportDialogOpen && (
        <ExportDialog
          isOpen
          onClose={() => minimongoStore.toggleExportDialog(false)}
        />
      )}
    </Hideable>
  )
})
