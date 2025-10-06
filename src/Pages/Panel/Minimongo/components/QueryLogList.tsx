import React, { FunctionComponent, useRef, useState, useEffect } from 'react'
import { FixedSizeList } from 'react-window'
import { observer } from 'mobx-react-lite'
import { usePanelStore } from '@/Stores/PanelStore'
import { QueryLogRow } from './QueryLogRow'
import styled from 'styled-components'

const QueryLogListWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;

  .header {
    display: flex;
    padding: 8px 15px;
    background-color: #2d3748;
    border-bottom: 1px solid #4a5568;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    color: #cbd5e0;

    div + div {
      margin-left: 10px;
    }

    .time {
      min-width: 80px;
    }

    .method {
      min-width: 80px;
    }

    .collection {
      min-width: 120px;
    }

    .runtime {
      min-width: 60px;
      text-align: right;
    }

    .selector {
      flex: 1;
    }

    .correlation {
      min-width: 120px;
    }
  }

  .list-container {
    flex: 1;
    min-height: 0;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #718096;
    font-style: italic;
  }
`

export const QueryLogList: FunctionComponent = observer(() => {
  const { minimongoStore } = usePanelStore()
  const logs = minimongoStore.methodLogs
  const containerRef = useRef<HTMLDivElement>(null)
  const [listHeight, setListHeight] = useState(600)

  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setListHeight(entry.contentRect.height)
      }
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  if (logs.length === 0) {
    return (
      <QueryLogListWrapper>
        <div className='empty-state'>
          No query logs yet. Interact with your Meteor app to see Minimongo
          operations.
        </div>
      </QueryLogListWrapper>
    )
  }

  return (
    <QueryLogListWrapper>
      <div className='header'>
        <div className='time'>Time</div>
        <div className='method'>Method</div>
        <div className='collection'>Collection</div>
        <div className='runtime'>Runtime</div>
        <div className='selector'>Selector</div>
        <div className='correlation'>Correlation</div>
      </div>
      <div className='list-container' ref={containerRef}>
        <FixedSizeList
          height={listHeight}
          itemCount={logs.length}
          itemSize={36}
          width='100%'
        >
          {({ index, style }) => (
            <QueryLogRow log={logs[index]} style={style} />
          )}
        </FixedSizeList>
      </div>
    </QueryLogListWrapper>
  )
})
