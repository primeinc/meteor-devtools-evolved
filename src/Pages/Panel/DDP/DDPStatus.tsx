import { Spinner, Tag, Tooltip } from '@blueprintjs/core'
import { isNumber } from 'lodash'
import { observer } from 'mobx-react-lite'
import React, {
  FormEvent,
  FunctionComponent,
  useCallback,
  useState,
} from 'react'
import { usePanelStore } from '@/Stores/PanelStore'
import { StatusBar } from '@/Components/StatusBar'
import { DDPFilterMenu } from '@/Pages/Panel/DDP/DDPFilterMenu'
import { Position } from '@blueprintjs/core/lib/esm/common/position'
import { TextInput } from '@/Components/TextInput'
import { PopoverButton } from '@/Components/PopoverButton'
import { Button } from '@/Components/Button'
import prettyBytes from 'pretty-bytes'
import { Field } from '@/Components/Field'
import { StringUtils } from '@/Utils/StringUtils'
import { AppToaster } from '@/AppToaster'
import { SecureExporter } from '@/Utils/SecureExporter'

export const DDPStatus: FunctionComponent = observer(() => {
  const store = usePanelStore()
  const { ddpStore, settingStore } = store

  const activeFilters = settingStore.activeFilters
  const setFilter = useCallback(
    (type, isEnabled) => settingStore.setFilter(type, isEnabled),
    [settingStore],
  )
  const collectionLength = ddpStore.collection.length
  const { inboundBytes, outboundBytes, isLoading, pagination } = ddpStore
  const [exporter, setExporter] = useState<SecureExporter | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = useCallback(async () => {
    try {
      setIsExporting(true)
      const newExporter = new SecureExporter()
      setExporter(newExporter)

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `ddp-logs-${timestamp}.json`

      await newExporter.export(ddpStore.collection, filename)

      AppToaster.show({
        icon: 'tick',
        message: 'DDP logs exported successfully',
        intent: 'success',
        timeout: 2000,
      })
    } catch (error) {
      if (!exporter?.isAborted()) {
        AppToaster.show({
          icon: 'error',
          message: 'Failed to export DDP logs',
          intent: 'danger',
          timeout: 2000,
        })
      }
    } finally {
      setIsExporting(false)
      setExporter(null)
    }
  }, [ddpStore.collection, exporter])

  const handleAbortExport = useCallback(() => {
    if (exporter && !exporter.isAborted()) {
      exporter.abort()
      AppToaster.show({
        icon: 'warning-sign',
        message: 'Export cancelled',
        intent: 'warning',
        timeout: 1500,
      })
      setIsExporting(false)
      setExporter(null)
    }
  }, [exporter])

  return (
    <StatusBar>
      <div className='left-group'>
        <PopoverButton
          icon='filter'
          height={28}
          content={
            <DDPFilterMenu
              setFilter={setFilter}
              activeFilters={activeFilters}
            />
          }
          position={Position.RIGHT_TOP}
        >
          Filter
        </PopoverButton>

        <TextInput
          icon='search'
          placeholder='Search...'
          onChange={(event: FormEvent<HTMLInputElement>) =>
            pagination.setSearch(event.currentTarget.value)
          }
        />

        <Field icon='eye-open'>{pagination.length}</Field>
      </div>

      <div className='right-group'>
        {isLoading && (
          <Field>
            <Spinner size={12} intent='warning' />
          </Field>
        )}

        {store.gitCommitHash ? (
          <Tooltip
            content='Git Commit Hash'
            hoverOpenDelay={800}
            position='top'
          >
            <Tag
              minimal
              interactive
              onClick={() => {
                StringUtils.toClipboard(store.gitCommitHash as string)
                AppToaster.show({
                  icon: 'tick',
                  message: 'Copied to Clipboard',
                  intent: 'success',
                  timeout: 1000,
                })
              }}
              style={{ marginRight: 4 }}
            >
              {store.gitCommitHash.slice(0, 8)}
            </Tag>
          </Tooltip>
        ) : null}

        {!!inboundBytes && (
          <Field icon='cloud-download'>{prettyBytes(inboundBytes)}</Field>
        )}

        {!!outboundBytes && (
          <Field icon='cloud-upload'>{prettyBytes(outboundBytes)}</Field>
        )}

        {collectionLength > 0 && !isExporting && (
          <Tooltip content='Export DDP logs' position='top'>
            <Button icon='export' onClick={handleExport} disabled={isExporting}>
              Export
            </Button>
          </Tooltip>
        )}

        {isExporting && (
          <Tooltip content='Cancel export' position='top'>
            <Button icon='cross' intent='danger' onClick={handleAbortExport}>
              Cancel
            </Button>
          </Tooltip>
        )}

        {isNumber(collectionLength) && (
          <Button
            intent='warning'
            onClick={() => ddpStore.clearLogs()}
            icon='inbox'
          >
            {collectionLength}
          </Button>
        )}
      </div>
    </StatusBar>
  )
})
