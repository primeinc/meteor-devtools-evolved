import React, { FunctionComponent, useState, useCallback } from 'react'
import { observer } from 'mobx-react-lite'
import { Hideable } from '@/Utils/Hideable'
import { usePanelStore } from '@/Stores/PanelStore'
import { QueryLogWaterfall } from './components/QueryLogWaterfall'
import { QueryLogDetail } from './components/QueryLogDetail'
import styled from 'styled-components'
import { createLogger } from '@/Utils/Logger'
import { MinimongoMethodLog } from '@/Stores/Panel/MinimongoStore/types'
import { saveBlob } from '@/Pages/Panel/Minimongo/services/ExportService'
import { Button, InputGroup, Tag, Switch, Tooltip } from '@blueprintjs/core'
import { StatusBar } from '@/Components/StatusBar'

const logger = createLogger('QueryLog')

interface Props {
  isVisible: boolean
}

const Container = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
`

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: #2d3748;
  border-bottom: 1px solid #4a5568;
  gap: 12px;

  .search-input {
    width: 200px;
  }

  .filters {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }

  .filter-tag {
    cursor: pointer;
    user-select: none;

    &.active {
      background: #3182ce;
    }
  }
`

const ContentWrapper = styled.div<{ hasDetail: boolean }>`
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;

  .waterfall-container {
    flex: 1;
    transition: margin-right 0.3s ease;
    margin-right: ${props => (props.hasDetail ? '450px' : '0')};
  }
`

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #a0aec0;

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .empty-title {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .empty-description {
    font-size: 14px;
    text-align: center;
    max-width: 400px;
    line-height: 1.5;
  }
`

export const QueryLog: FunctionComponent<Props> = observer(({ isVisible }) => {
  const { minimongoStore } = usePanelStore()
  const [selectedLog, setSelectedLog] = useState<MinimongoMethodLog | null>(
    null,
  )

  // All filter state now lives in the store - no local state needed
  // MobX computed handles all derivations efficiently
  const processedLogs = minimongoStore.filteredMethodLogs

  const toggleFilter = useCallback(
    (method: string) => {
      minimongoStore.setQueryLogFilter(
        method,
        !minimongoStore.queryLogFilters[method],
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minimongoStore.setQueryLogFilter],
  )

  // Removed clear logs to avoid interfering with live data

  // Temporarily disabled logger to diagnose infinite loop
  // logger.debug('QueryLog panel rendered', {
  //   isVisible,
  //   totalLogs: minimongoStore.methodLogs.length,
  //   filteredLogs: processedLogs.length,
  //   showRedundant: minimongoStore.queryLogShowRedundant,
  // })

  return (
    <Hideable isVisible={isVisible}>
      <Container className='mde-content'>
        <Toolbar>
          <InputGroup
            className='search-input'
            leftIcon='search'
            placeholder='Search collections, methods...'
            value={minimongoStore.queryLogSearch}
            onChange={e => minimongoStore.setQueryLogSearch(e.target.value)}
          />

          <Switch
            label='Show redundant'
            checked={minimongoStore.queryLogShowRedundant}
            onChange={e =>
              minimongoStore.setQueryLogShowRedundant(e.currentTarget.checked)
            }
          />

          <div className='filters'>
            <Tooltip content='Toggle find/findOne queries'>
              <Tag
                className={`filter-tag ${
                  minimongoStore.queryLogFilters['find'] ? 'active' : ''
                }`}
                intent={
                  minimongoStore.queryLogFilters['find'] ? 'primary' : 'none'
                }
                interactive
                onClick={() => {
                  toggleFilter('find')
                  toggleFilter('findOne')
                  toggleFilter('fetch')
                }}
              >
                Reads
              </Tag>
            </Tooltip>

            <Tooltip content='Toggle insert operations'>
              <Tag
                className={`filter-tag ${
                  minimongoStore.queryLogFilters['insert'] ? 'active' : ''
                }`}
                intent={
                  minimongoStore.queryLogFilters['insert'] ? 'success' : 'none'
                }
                interactive
                onClick={() => toggleFilter('insert')}
              >
                Inserts
              </Tag>
            </Tooltip>

            <Tooltip content='Toggle update/upsert operations'>
              <Tag
                className={`filter-tag ${
                  minimongoStore.queryLogFilters['update'] ? 'active' : ''
                }`}
                intent={
                  minimongoStore.queryLogFilters['update'] ? 'warning' : 'none'
                }
                interactive
                onClick={() => {
                  toggleFilter('update')
                  toggleFilter('upsert')
                }}
              >
                Updates
              </Tag>
            </Tooltip>

            <Tooltip content='Toggle remove operations'>
              <Tag
                className={`filter-tag ${
                  minimongoStore.queryLogFilters['remove'] ? 'active' : ''
                }`}
                intent={
                  minimongoStore.queryLogFilters['remove'] ? 'danger' : 'none'
                }
                interactive
                onClick={() => toggleFilter('remove')}
              >
                Removes
              </Tag>
            </Tooltip>
          </div>
        </Toolbar>

        <ContentWrapper hasDetail={!!selectedLog}>
          {processedLogs.length > 0 ? (
            <div className='waterfall-container'>
              <QueryLogWaterfall
                logs={processedLogs}
                onSelectLog={setSelectedLog}
                selectedLog={selectedLog}
              />
            </div>
          ) : (
            <EmptyState>
              <div className='empty-icon'>📊</div>
              <div className='empty-title'>No Query Logs</div>
              <div className='empty-description'>
                {minimongoStore.methodLogs.length === 0
                  ? 'Interact with your Meteor app to see Minimongo operations appear here.'
                  : 'All operations are filtered. Adjust your filters to see logs.'}
              </div>
            </EmptyState>
          )}

          <QueryLogDetail
            log={selectedLog}
            onClose={() => setSelectedLog(null)}
          />
        </ContentWrapper>

        <StatusBar>
          <div className='left-group'>
            <Tag minimal>
              {processedLogs.length} / {minimongoStore.methodLogs.length}{' '}
              operations
            </Tag>
            {!minimongoStore.queryLogShowRedundant &&
              minimongoStore.methodLogs.length - processedLogs.length > 0 && (
                <Tag minimal intent='warning' style={{ marginLeft: 8 }}>
                  {minimongoStore.methodLogs.length - processedLogs.length}{' '}
                  hidden
                </Tag>
              )}
          </div>
          <div className='right-group'>
            <Button
              small
              minimal
              icon='export'
              text='Export'
              onClick={async () => {
                const data = JSON.stringify(processedLogs, null, 2)
                const blob = new Blob([data], { type: 'application/json' })
                await saveBlob(
                  blob,
                  `query-log-${Date.now()}.json`,
                  new AbortController().signal,
                  () => {},
                )
              }}
            />
          </div>
        </StatusBar>
      </Container>
    </Hideable>
  )
})
