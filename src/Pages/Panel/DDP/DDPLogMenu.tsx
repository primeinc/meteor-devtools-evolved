import { Icon } from '@blueprintjs/core'
import { PanelPage } from '@/Constants'
import { Bridge } from '@/Bridge'
import React, { FunctionComponent } from 'react'
import { usePanelStore } from '@/Stores/PanelStore'

interface Props {
  log: DDPLog
}

const PARENTHESIS_REGEX = /(\S*) \(([^)]+)\)/

/**
 * Parse raw stack trace string into StackTrace objects
 * This is done lazily only when user clicks to view the stack trace
 */
const parseStackTrace = (rawStack: string): StackTrace[] => {
  return rawStack
    .split('\n')
    .slice(2) // Remove Error header and first frame
    .map(line => {
      const matches = PARENTHESIS_REGEX.exec(line.trim())
      if (!matches) return null
      return {
        callee: matches[1],
        url: matches[2],
      }
    })
    .filter((frame): frame is StackTrace => frame !== null)
}

export const DDPLogMenu: FunctionComponent<Props> = ({ log }) => {
  const store = usePanelStore()

  const handleViewStackTrace = () => {
    // Parse raw stack trace lazily only when user clicks
    if (log.rawStackTrace) {
      const parsed = parseStackTrace(log.rawStackTrace)
      store.setActiveStackTrace(parsed)
    } else if (log.trace) {
      // Fallback for old logs that have pre-parsed trace
      store.setActiveStackTrace(log.trace)
    }
  }

  return (
    <div className='menu invisible flex flex-row gap-2 group-hover:visible'>
      <Icon
        icon='eye-open'
        onClick={handleViewStackTrace}
        style={{
          cursor: 'pointer',
          opacity: log.rawStackTrace || log.trace ? 1 : 0.3,
        }}
      />
      <Icon
        icon={
          store.bookmarkStore.bookmarkIds.includes(log.id)
            ? 'star'
            : 'star-empty'
        }
        onClick={() =>
          store.bookmarkStore.bookmarkIds.includes(log.id)
            ? store.bookmarkStore.remove(log)
            : store.bookmarkStore.add(log)
        }
        style={{ cursor: 'pointer' }}
      />
      {log.parsedContent?.msg === 'method' && (
        <Icon
          icon='play'
          onClick={() => {
            store.setSelectedTabId(PanelPage.DDP)

            Bridge.sendContentMessage({
              eventType: 'ddp-run-method',
              data: log.parsedContent,
            })
          }}
          style={{ cursor: 'pointer' }}
        />
      )}
    </div>
  )
}
