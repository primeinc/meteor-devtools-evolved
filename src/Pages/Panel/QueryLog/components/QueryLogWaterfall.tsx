import React, { FunctionComponent, useState, useMemo, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import { untracked } from 'mobx'
import styled from 'styled-components'
import { Tag, Tooltip } from '@blueprintjs/core'
import { MinimongoMethodLog } from '@/Stores/Panel/MinimongoStore/types'
import { minimongoCorrelator } from '@/Services/MinimongoDDPCorrelator'
import { usePanelStore } from '@/Stores/PanelStore'

interface Props {
  logs: MinimongoMethodLog[]
  onSelectLog: (log: MinimongoMethodLog) => void
  selectedLog?: MinimongoMethodLog
}

const WaterfallContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: #1e2936;
  font-family: monospace;
  font-size: 11px;
`

const TimelineHeader = styled.div`
  display: flex;
  height: 30px;
  background: #2d3748;
  border-bottom: 1px solid #4a5568;
  padding: 0 15px;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 10;
`

const TimeAxis = styled.div`
  display: flex;
  height: 20px;
  background: #2d3748;
  border-bottom: 1px solid #4a5568;
  position: relative;
  margin-left: 280px;

  .tick {
    position: absolute;
    top: 0;
    height: 100%;
    border-left: 1px solid #4a5568;
    font-size: 10px;
    padding: 2px 4px;
    color: #a0aec0;
  }
`

const WaterfallContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  position: relative;
`

const WaterfallRow = styled.div<{ isSelected?: boolean }>`
  display: flex;
  align-items: center;
  height: 28px;
  border-bottom: 1px solid #2d3748;
  position: relative;
  cursor: pointer;
  background: ${props => (props.isSelected ? '#394b59' : 'transparent')};

  &:hover {
    background: #394b59;
  }

  .info-section {
    width: 280px;
    min-width: 280px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    border-right: 1px solid #2d3748;

    .time {
      font-size: 10px;
      color: #a0aec0;
      width: 80px;
    }

    .collection {
      flex: 1;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .method-tag {
      font-size: 10px;
    }
  }

  .timeline-section {
    flex: 1;
    position: relative;
    height: 100%;
  }
`

const TimelineBar = styled.div<{
  left: number
  width: number
  color: string
  hasCorrelation: boolean
}>`
  position: absolute;
  top: 4px;
  height: 20px;
  background: ${props => props.color};
  border-radius: 2px;
  left: ${props => props.left}px;
  width: ${props => Math.max(props.width, 2)}px;
  display: flex;
  align-items: center;
  padding: 0 4px;
  font-size: 10px;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  border: ${props => (props.hasCorrelation ? '1px solid #8b5cf6' : 'none')};

  &:hover {
    z-index: 5;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  }
`

const DDPCorrelationLine = styled.div<{ left: number }>`
  position: absolute;
  left: ${props => props.left}px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #8b5cf6;
  opacity: 0.5;
  pointer-events: none;
`

const ZoomControls = styled.div`
  display: flex;
  gap: 4px;
  margin-left: auto;

  button {
    padding: 2px 8px;
    background: #394b59;
    border: 1px solid #4a5568;
    color: #e2e8f0;
    cursor: pointer;
    border-radius: 2px;
    font-size: 11px;

    &:hover {
      background: #4a5568;
    }
  }
`

const getMethodColor = (method: string) => {
  switch (method) {
    case 'find':
    case 'findOne':
    case 'fetch':
    case 'count':
      return '#3182ce' // Blue for reads
    case 'insert':
      return '#10b981' // Green for inserts
    case 'update':
    case 'upsert':
      return '#f59e0b' // Orange for updates
    case 'remove':
      return '#ef4444' // Red for removes
    default:
      return '#718096' // Gray for unknown
  }
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return (
    date.toTimeString().split(' ')[0] +
    '.' +
    date.getMilliseconds().toString().padStart(3, '0')
  )
}

const formatDuration = (ms: number) => {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export const QueryLogWaterfall: FunctionComponent<Props> = observer(
  ({ logs, onSelectLog, selectedLog }) => {
    const { ddpStore } = usePanelStore()
    const [zoom, setZoom] = useState(1)
    const [scrollLeft, setScrollLeft] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)

    // Calculate time range and scale
    const timeRange = useMemo(() => {
      if (logs.length === 0) return { start: 0, end: 0, duration: 0 }

      const timestamps = logs.map(l => l.timestamp)
      const start = Math.min(...timestamps)
      const end = Math.max(...timestamps.map((t, i) => t + logs[i].runtime))
      const duration = end - start

      return { start, end, duration }
    }, [logs])

    // Calculate pixel scale (pixels per millisecond)
    const pixelsPerMs = useMemo(() => {
      // Base scale: fit timeline in 1000px width
      const baseScale = 1000 / Math.max(timeRange.duration, 100)
      return baseScale * zoom
    }, [timeRange.duration, zoom])

    // Generate timeline ticks
    const ticks = useMemo(() => {
      const tickInterval = timeRange.duration > 1000 ? 100 : 10 // 100ms or 10ms intervals
      const tickCount = Math.ceil(timeRange.duration / tickInterval)

      return Array.from({ length: tickCount + 1 }, (_, i) => ({
        time: i * tickInterval,
        label: `${i * tickInterval}ms`,
      }))
    }, [timeRange.duration])

    // Find correlated DDP messages
    // Use untracked snapshot to avoid MobX reactions inside memo
    const ddpCollectionLength = ddpStore.collection.length

    const ddpCorrelations = useMemo(() => {
      // Snapshot collection WITHOUT tracking reads
      const ddpSnapshot = untracked(() => ddpStore.collection.slice())
      const correlations = new Map<number, any[]>()

      logs.forEach(log => {
        const relatedDDP = ddpSnapshot.filter(ddp => {
          if (!ddp.parsedContent?.collection || !ddp.timestamp) return false
          return (
            ddp.parsedContent.collection === log.collectionName &&
            Math.abs(ddp.timestamp - log.timestamp) < 100
          )
        })

        if (relatedDDP.length > 0) {
          correlations.set(log.timestamp, relatedDDP)
        }
      })

      return correlations
    }, [logs, ddpCollectionLength])

    const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.5, 10))
    const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.5, 0.5))
    const handleZoomReset = () => setZoom(1)

    return (
      <WaterfallContainer>
        <TimelineHeader>
          <span style={{ color: '#a0aec0', marginRight: 'auto' }}>
            Query Timeline ({logs.length} operations,{' '}
            {formatDuration(timeRange.duration)} total)
          </span>
          <ZoomControls>
            <button onClick={handleZoomOut} title='Zoom Out'>
              -
            </button>
            <button onClick={handleZoomReset} title='Reset Zoom'>
              {(zoom * 100).toFixed(0)}%
            </button>
            <button onClick={handleZoomIn} title='Zoom In'>
              +
            </button>
          </ZoomControls>
        </TimelineHeader>

        <TimeAxis>
          {ticks.map(tick => (
            <div
              key={tick.time}
              className='tick'
              style={{ left: tick.time * pixelsPerMs }}
            >
              {tick.label}
            </div>
          ))}
        </TimeAxis>

        <WaterfallContent ref={containerRef}>
          {logs.map((log, index) => {
            const relativeStart = log.timestamp - timeRange.start
            const barLeft = relativeStart * pixelsPerMs
            const barWidth = log.runtime * pixelsPerMs
            // Use untracked to prevent MobX reaction loop when accessing DDP store
            const correlation = untracked(() =>
              minimongoCorrelator.getCorrelationForQuery(log),
            )
            const hasCorrelation = correlation.correlationConfidence !== 'NONE'
            const ddpMessages = ddpCorrelations.get(log.timestamp)

            return (
              <WaterfallRow
                key={`${log.timestamp}-${index}`}
                isSelected={selectedLog === log}
                onClick={() => onSelectLog(log)}
              >
                <div className='info-section'>
                  <span className='time'>{formatTime(log.timestamp)}</span>
                  <span className='collection'>{log.collectionName}</span>
                  <Tag
                    className='method-tag'
                    intent={
                      log.method === 'find'
                        ? 'primary'
                        : log.method === 'insert'
                        ? 'success'
                        : log.method === 'update'
                        ? 'warning'
                        : log.method === 'remove'
                        ? 'danger'
                        : 'none'
                    }
                    minimal
                  >
                    {log.method}
                  </Tag>
                </div>

                <div className='timeline-section'>
                  {/* DDP correlation line */}
                  {ddpMessages &&
                    ddpMessages.map((ddp, i) => (
                      <DDPCorrelationLine
                        key={i}
                        left={(ddp.timestamp - timeRange.start) * pixelsPerMs}
                      />
                    ))}

                  {/* Operation bar */}
                  <Tooltip
                    content={
                      <div>
                        <div>
                          <strong>
                            {log.collectionName}.{log.method}()
                          </strong>
                        </div>
                        <div>Duration: {formatDuration(log.runtime)}</div>
                        {log.selector && (
                          <div>Selector: {JSON.stringify(log.selector)}</div>
                        )}
                        {hasCorrelation && (
                          <div>
                            DDP Activity: {correlation.addedDocuments} added,
                            {correlation.changedDocuments} changed,
                            {correlation.removedDocuments} removed
                          </div>
                        )}
                      </div>
                    }
                    position='top'
                  >
                    <TimelineBar
                      left={barLeft}
                      width={barWidth}
                      color={getMethodColor(log.method)}
                      hasCorrelation={hasCorrelation}
                    >
                      {formatDuration(log.runtime)}
                    </TimelineBar>
                  </Tooltip>
                </div>
              </WaterfallRow>
            )
          })}
        </WaterfallContent>
      </WaterfallContainer>
    )
  },
)
