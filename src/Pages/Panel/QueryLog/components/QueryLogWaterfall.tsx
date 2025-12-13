import React, { FunctionComponent, useState, useRef, useEffect } from 'react'
import { FixedSizeList as List, ListChildComponentProps, areEqual } from 'react-window'
import { observer } from 'mobx-react-lite'
import { untracked } from 'mobx'
import styled from 'styled-components'
import { Tag, Tooltip, Button, ButtonGroup } from '@blueprintjs/core'
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
  height: 36px;
  background: rgba(45, 55, 72, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0 16px;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 20;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
`

const TimeAxis = styled.div`
  display: flex;
  height: 24px;
  background: rgba(30, 41, 54, 0.95);
  border-bottom: 1px solid #2d3748;
  position: relative;
  margin-left: 280px;

  .tick {
    position: absolute;
    top: 4px;
    height: 100%;
    border-left: 1px solid #4a5568;
    font-size: 10px;
    padding-left: 4px;
    color: #a0aec0;
    pointer-events: none;
  }
`

const WaterfallContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  position: relative;
`

const WaterfallRow = styled.div<{ isSelected?: boolean; index: number }>`
  display: flex;
  align-items: center;
  height: 32px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  position: relative;
  cursor: pointer;
  background: ${props =>
    props.isSelected
      ? 'rgba(66, 153, 225, 0.15)'
      : props.index % 2 === 0
      ? 'transparent'
      : 'rgba(255, 255, 255, 0.01)'};
  transition: background 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .info-section {
    width: 280px;
    min-width: 280px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    border-right: 1px solid #2d3748;
    background: rgba(30, 41, 54, 0.5);

    .time {
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      color: #718096;
      width: 70px;
    }

    .collection {
      flex: 1;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
    }

    .method-tag {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.5px;
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
  colorConfig: { bg: string; border: string; text: string }
  hasCorrelation: boolean
}>`
  position: absolute;
  top: 6px;
  height: 20px;
  background: ${props => props.colorConfig.bg};
  border: 1px solid ${props => props.colorConfig.border};
  border-radius: 4px;
  left: ${props => props.left}px;
  width: ${props => Math.max(props.width, 2)}px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 500;
  color: ${props => props.colorConfig.text};
  white-space: nowrap;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;

  ${props =>
    props.hasCorrelation &&
    `
    box-shadow: 0 0 0 1px #8b5cf6, 0 2px 4px rgba(139, 92, 246, 0.2);
  `}

  &:hover {
    z-index: 10;
    transform: translateY(-1px);
    filter: brightness(1.1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
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
`

const getMethodColor = (method: string) => {
  // Vibrant HSL palette for dark mode
  switch (method) {
    case 'find':
    case 'findOne':
    case 'fetch':
    case 'count':
      // Blue: hsl(210, 100%, 50%) -> solid readable
      return {
        bg: 'linear-gradient(180deg, hsl(215, 85%, 45%) 0%, hsl(215, 85%, 35%) 100%)',
        border: 'hsl(215, 85%, 55%)',
        text: '#fff',
      }
    case 'insert':
      // Green: hsl(150, 100%, 35%)
      return {
        bg: 'linear-gradient(180deg, hsl(150, 80%, 35%) 0%, hsl(150, 80%, 25%) 100%)',
        border: 'hsl(150, 80%, 45%)',
        text: '#fff',
      }
    case 'update':
    case 'upsert':
      // Amber: hsl(35, 100%, 40%)
      return {
        bg: 'linear-gradient(180deg, hsl(35, 90%, 40%) 0%, hsl(35, 90%, 30%) 100%)',
        border: 'hsl(35, 90%, 50%)',
        text: '#fff',
      }
    case 'remove':
      // Red: hsl(0, 85%, 50%)
      return {
        bg: 'linear-gradient(180deg, hsl(0, 75%, 45%) 0%, hsl(0, 75%, 35%) 100%)',
        border: 'hsl(0, 75%, 55%)',
        text: '#fff',
      }
    default:
      // Gray
      return {
        bg: '#4a5568',
        border: '#718096',
        text: '#e2e8f0',
      }
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

const GridLine = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.03);
  pointer-events: none;
  z-index: 0;
`

const Row = observer(
  ({ data, index, style }: ListChildComponentProps<WaterfallData>) => {
    const { logs, timeRange, pixelsPerMs, onSelectLog, selectedLog, ddpStore, ticks } =
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
        index={index}
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
          {/* Grid Lines per row */}
          {ticks.map((tick, i) => (
             <div
               key={i}
               style={{
                 position: 'absolute',
                 left: (tick.time - timeRange.start) * pixelsPerMs,
                 top: 0,
                 bottom: 0,
                 width: 1,
                 background: 'rgba(255, 255, 255, 0.03)',
                 pointerEvents: 'none'
               }}
             />
          ))}

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
                  <div>
                    Selector:{' '}
                    {JSON.stringify(log.selector).length > 150
                      ? JSON.stringify(log.selector).slice(0, 150) + '...'
                      : JSON.stringify(log.selector)}
                  </div>
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
              colorConfig={getMethodColor(log.method)}
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
  ticks: { time: number; label: string }[]
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
      ddpStore,
      ticks // Pass ticks to rows for grid lines
    }

    return (
      <WaterfallContainer>
        <TimelineHeader>
          <span style={{ color: '#a0aec0', marginRight: 'auto' }}>
            Query Timeline ({logs.length} operations,{' '}
            {formatDuration(timeRange.duration)} total)
          </span>
          <ZoomControls>
            <ButtonGroup minimal>
              <Button icon='zoom-out' onClick={handleZoomOut} title='Zoom Out' />
              <Button
                onClick={handleZoomReset}
                title='Reset Zoom'
                text={`${(zoom * 100).toFixed(0)}%`}
                style={{ minWidth: 50 }}
              />
              <Button icon='zoom-in' onClick={handleZoomIn} title='Zoom In' />
            </ButtonGroup>
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
                itemSize={33} // 32px height + 1px border
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
