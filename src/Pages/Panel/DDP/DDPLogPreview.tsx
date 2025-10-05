import { usePanelStore } from '@/Stores/PanelStore'
import { Icon, IconName, Tag, Tooltip } from '@blueprintjs/core'
import React, { FunctionComponent } from 'react'
import styled from 'styled-components'

const RPCTimeline = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #8a9ba8;
  margin-left: 8px;

  .arrow {
    color: #5c7080;
  }

  .result-marker,
  .ready-marker {
    color: #48aff0;
  }
`

const getTag = (icon: IconName, title: string) => (
  <Tooltip
    content={title}
    hoverOpenDelay={800}
    position='top'
    className='content-icon'
  >
    <Icon
      icon={icon}
      style={{
        color: '#8a9ba8',
      }}
      iconSize={12}
    />
  </Tooltip>
)

const getTypeTag = (filterType?: FilterType | null) => {
  switch (filterType) {
    case 'heartbeat':
      return getTag('heart', 'Heartbeat')
    case 'connection':
      return getTag('globe-network', 'Connection')
    case 'collection':
      return getTag('database', 'Collection')
    case 'subscription':
      return getTag('feed-subscribed', 'Subscription')
    case 'method':
      return getTag('derive-column', 'Method')
    default:
      return getTag('warning-sign', 'Unknown')
  }
}

export const DDPLogPreview: FunctionComponent<Partial<DDPLog>> = ({
  filterType,
  parsedContent,
  preview,
}) => {
  const store = usePanelStore()
  const latency =
    parsedContent?.id && parsedContent?.msg === 'method'
      ? store.ddpStore.getMethodLatency(parsedContent.id)
      : null

  return (
    <>
      {getTypeTag(filterType)}
      <Tag
        interactive
        minimal
        onClick={() => {
          parsedContent && store.setActiveObject(parsedContent)
        }}
        className='content-preview'
        intent={parsedContent?.error ? 'danger' : 'none'}
      >
        <small>
          <code>{preview}</code>
        </small>
      </Tag>
      {latency && (
        <RPCTimeline>
          <span className='method-start'>method</span>
          <span className='arrow'>→</span>
          <Tooltip content='Server computed result' position='top'>
            <span className='result-marker'>
              result ({latency.timeToResult.toFixed(0)}ms)
            </span>
          </Tooltip>
          {latency.timeToReady && (
            <>
              <span className='arrow'>→</span>
              <Tooltip
                content='All data side-effects sent'
                position='top'
              >
                <span className='ready-marker'>
                  ready ({latency.timeToReady.toFixed(0)}ms)
                </span>
              </Tooltip>
            </>
          )}
        </RPCTimeline>
      )}
    </>
  )
}
