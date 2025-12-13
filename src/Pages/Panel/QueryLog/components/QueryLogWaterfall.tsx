import React, { FunctionComponent, useState, useRef, useEffect } from 'react'
import { FixedSizeList as List, ListChildComponentProps, areEqual } from 'react-window'
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

const WaterfallContainerWrapper = styled.div`
  flex: 1;
  height: 100%;
  width: 100%;
  position: relative;
`

const Row = observer(
  ({ data, index, style }: ListChildComponentProps<WaterfallData>) => {
    const { logs, timeRange, pixelsPerMs, onSelectLog, selectedLog, ddpStore } =
      data
    const log = logs[index]
    const relativeStart = log.timestamp - timeRange.start
    const barLeft = relativeStart * pixelsPerMs
    const barWidth = log.runtime * pixelsPerMs

    // Use untracked to prevent MobX reaction loop when accessing DDP store if needed,
    // but here we want to react to DDP changes if they affect correlation.
    // However, for performance, we might want to be careful.
    // The original code used untracked(). We will stick to that to avoid
    // excessive re-renders from DDP stream, assuming correlations don't change
    // for past logs often.
    const correlation = untracked(() =>
      minimongoCorrelator.getCorrelationForQuery(log),
    )
    
    // We can also access ddpStore to force reactivity if we wanted, 
    // but the original code avoided it for a reason (infinite loops?).
    // We will follow the untracked pattern but ensure clean rendering.

    const hasCorrelation = correlation.correlationConfidence !== 'NONE'
    
    // We need to get DDP messages for the line.
    // The original code calculated this upfront.
    // Here we calculate it per row.
    const getDDPMessages = () => {
       // We use untracked here as well to match the pattern
       const ddpSnapshot = untracked(() => ddpStore.collection)
       return ddpSnapshot.filter(ddp => {
          if (!ddp.parsedContent?.collection || !ddp.timestamp) return false
          return (
            ddp.parsedContent.collection === log.collectionName &&
            Math.abs(ddp.timestamp - log.timestamp) < 100
          )
        })
    }
    const ddpMessages = getDDPMessages()

    return (
      <WaterfallRow
        style={style}
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
          {ddpMessages.map((ddp, i) => (
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
            // Ensure potential clipping is handled if Blueprint supports it, 
            // though without portal it might clip. 
            // Standard Blueprint Tooltip usually portals correctly.
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
  },
)

interface WaterfallData {
  logs: MinimongoMethodLog[]
  timeRange: { start: number; end: number; duration: number }
  pixelsPerMs: number
  onSelectLog: (log: MinimongoMethodLog) => void
  selectedLog?: MinimongoMethodLog
  ddpStore: any // Type this properly if possible
}

export const QueryLogWaterfall: FunctionComponent<Props> = observer(
  ({ logs, onSelectLog, selectedLog }) => {
    const { ddpStore } = usePanelStore()
    const [zoom, setZoom] = useState(1)
    const [size, setSize] = useState({ width: 0, height: 0 })
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      if (!containerRef.current) return
      
      const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
           setSize({
             width: entry.contentRect.width,
             height: entry.contentRect.height
           })
        }
      })
      
      resizeObserver.observe(containerRef.current)
      
      return () => resizeObserver.disconnect()
    }, [])

    // Calculate time range and scale
    const timeRange = React.useMemo(() => {
      if (logs.length === 0) return { start: 0, end: 0, duration: 0 }

      const timestamps = logs.map(l => l.timestamp)
      const start = Math.min(...timestamps)
      const end = Math.max(...timestamps.map((t, i) => t + logs[i].runtime))
      const duration = end - start

      return { start, end, duration }
    }, [logs])

    const pixelsPerMs = zoom

    // Generate timeline ticks
    const tickInterval = timeRange.duration > 1000 ? 100 : 10
    const tickCount = Math.ceil(timeRange.duration / tickInterval)
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => ({
      time: i * tickInterval,
      label: `${i * tickInterval}ms`,
    }))

    const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.5, 10))
    const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.5, 0.5))
    const handleZoomReset = () => setZoom(1)
    
    const itemData: WaterfallData = {
      logs,
      timeRange,
      pixelsPerMs,
      onSelectLog,
      selectedLog,
      ddpStore
    }

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

        <WaterfallContainerWrapper ref={containerRef}>
          {size.height > 0 && (
             <List
                height={size.height}
                width={size.width}
                itemCount={logs.length}
                itemSize={29} // 28px height + 1px border
                itemData={itemData}
             >
                {Row}
             </List>
          )}
        </WaterfallContainerWrapper>
      </WaterfallContainer>
    )
  },
)
