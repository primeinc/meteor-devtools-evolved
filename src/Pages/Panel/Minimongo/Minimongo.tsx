import { MinimongoNavigator } from '@/Pages/Panel/Minimongo/MinimongoNavigator'
import { usePanelStore } from '@/Stores/PanelStore'
import { Hideable } from '@/Utils/Hideable'
import { observer } from 'mobx-react-lite'
import React, { FunctionComponent, useEffect } from 'react'
import { MinimongoContainer } from '@/Pages/Panel/Minimongo/MinimongoContainer'
import styled from 'styled-components'
import { MinimongoStatus } from '@/Pages/Panel/Minimongo/MinimongoStatus'
import { Button } from '@/Components/Button'
import prettyBytes from 'pretty-bytes'
import { ExportDialog } from '@/Pages/Panel/Minimongo/components/ExportDialog'

interface Props {
  isVisible: boolean
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: row;
  height: 100%;

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

  // Use useEffect to avoid setting state during render
  // Direct Set creation - MobX observer handles updates
  const collectionNames = minimongoStore.collectionNames
  const collectionNamesSet = new Set(collectionNames)

  useEffect(() => {
    const isActiveCollectionMissing =
      minimongoStore.activeCollection &&
      !collectionNamesSet.has(minimongoStore.activeCollection)

    if (isActiveCollectionMissing) {
      minimongoStore.setActiveCollection(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    minimongoStore.activeCollection,
    collectionNames,
    minimongoStore.setActiveCollection,
  ])

  return (
    <Hideable isVisible={isVisible}>
      <div className={'mde-content'}>
        <Wrapper>
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
