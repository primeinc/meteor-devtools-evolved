import { Tag } from '@blueprintjs/core'
import React, { CSSProperties, FunctionComponent } from 'react'
import styled from 'styled-components'
import { truncate } from '@/Styles/Mixins'
import { MinimongoMethodLog } from '@/Stores/Panel/MinimongoStore/types'
import { minimongoCorrelator } from '@/Services/MinimongoDDPCorrelator'
import { observer } from 'mobx-react-lite'

interface Props {
  log: MinimongoMethodLog
  style: CSSProperties
}

const QueryLogWrapper = styled.div`
  display: flex;
  align-items: center;
  flex-direction: row;
  justify-content: space-between;
  padding: 5px 15px;

  &:hover {
    background-color: #394b59;
  }

  div + div {
    margin-left: 10px;
  }

  .time {
    font-size: 11px;
    font-family: monospace;
    min-width: 80px;
  }

  .method {
    min-width: 80px;
    font-weight: 600;
  }

  .collection {
    min-width: 120px;
    font-family: monospace;
  }

  .runtime {
    min-width: 60px;
    font-family: monospace;
    text-align: right;
  }

  .selector {
    flex: 1;
    min-width: 0;
    font-family: monospace;
    font-size: 11px;
    ${truncate}
  }

  .correlation {
    display: flex;
    gap: 5px;
  }
`

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return (
    date.toTimeString().split(' ')[0] +
    '.' +
    date.getMilliseconds().toString().padStart(3, '0')
  )
}

export const QueryLogRow: FunctionComponent<Props> = observer(
  ({ log, style }) => {
    const correlation = minimongoCorrelator.getCorrelationForQuery(log)

    const getMethodIntent = (method: string) => {
      if (method === 'find' || method === 'findOne') return 'primary'
      if (method === 'insert') return 'success'
      if (method === 'update' || method === 'upsert') return 'warning'
      if (method === 'remove') return 'danger'
      return 'none'
    }

    const getCorrelationIntent = (confidence: string) => {
      if (confidence === 'HIGH') return 'success'
      if (confidence === 'MEDIUM') return 'warning'
      if (confidence === 'LOW') return 'none'
      return 'none'
    }

    return (
      <QueryLogWrapper style={style}>
        <div className="time">{formatTime(log.timestamp)}</div>
        <div className="method">
          <Tag intent={getMethodIntent(log.method)} minimal>
            {log.method}
          </Tag>
        </div>
        <div className="collection">{log.collectionName}</div>
        <div className="runtime">{log.runtime}ms</div>
        <div className="selector">
          {log.selector ? JSON.stringify(log.selector) : '{}'}
        </div>
        {correlation.correlationConfidence !== 'NONE' && (
          <div className="correlation">
            <Tag
              intent={getCorrelationIntent(correlation.correlationConfidence)}
              minimal
            >
              DDP: {correlation.addedDocuments}↑ {correlation.changedDocuments}↻{' '}
              {correlation.removedDocuments}↓
            </Tag>
          </div>
        )}
      </QueryLogWrapper>
    )
  },
)
