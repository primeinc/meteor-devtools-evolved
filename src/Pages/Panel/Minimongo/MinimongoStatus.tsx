import React, {
  FormEvent,
  FunctionComponent,
  useCallback,
  useState,
} from 'react'
import { StatusBar } from '@/Components/StatusBar'
import { Button } from '@/Components/Button'
import { TextInput } from '@/Components/TextInput'
import { Field } from '@/Components/Field'
import { observer } from 'mobx-react-lite'
import { usePanelStore } from '@/Stores/PanelStore'
import { Tooltip } from '@blueprintjs/core'
import { AppToaster } from '@/AppToaster'
import { SecureExporter } from '@/Utils/SecureExporter'

export const MinimongoStatus: FunctionComponent = observer(() => {
  const { minimongoStore } = usePanelStore()
  const [exporter, setExporter] = useState<SecureExporter | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = useCallback(async () => {
    try {
      setIsExporting(true)
      const newExporter = new SecureExporter()
      setExporter(newExporter)

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const collectionName =
        minimongoStore.activeCollection || 'all-collections'
      const filename = `minimongo-${collectionName}-${timestamp}.json`

      const dataToExport = minimongoStore.activeCollection
        ? minimongoStore.activeCollectionDocuments.collection
        : Object.entries(minimongoStore.collections).reduce((acc, [name, docs]) => {
            acc[name] = docs.map(wrapper => wrapper.document)
            return acc
          }, {} as Record<string, IDocument[]>)

      await newExporter.export(dataToExport, filename)

      AppToaster.show({
        icon: 'tick',
        message: 'Minimongo data exported successfully',
        intent: 'success',
        timeout: 2000,
      })
    } catch (error) {
      if (!exporter?.isAborted()) {
        AppToaster.show({
          icon: 'error',
          message: 'Failed to export Minimongo data',
          intent: 'danger',
          timeout: 2000,
        })
      }
    } finally {
      setIsExporting(false)
      setExporter(null)
    }
  }, [
    minimongoStore.activeCollection,
    minimongoStore.activeCollectionDocuments.collection,
    minimongoStore.collections,
    exporter,
  ])

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

  const hasData = minimongoStore.activeCollection
    ? minimongoStore.activeCollectionDocuments.collection.length > 0
    : minimongoStore.totalDocuments > 0

  return (
    <StatusBar>
      <div className='left-group'>
        <Button
          icon={minimongoStore.activeCollection ? 'database' : 'asterisk'}
          onClick={() => minimongoStore.setNavigatorVisible(true)}
          disabled={!minimongoStore.collectionNames.length}
        >
          {minimongoStore.activeCollection || 'Everything'}
        </Button>

        {minimongoStore.activeCollection && (
          <Button
            icon='asterisk'
            onClick={() => minimongoStore.setActiveCollection(null)}
          >
            Clear
          </Button>
        )}

        <TextInput
          icon='search'
          placeholder='Search...'
          onChange={(event: FormEvent<HTMLInputElement>) =>
            minimongoStore.activeCollectionDocuments.pagination.setSearch(
              event.currentTarget.value,
            )
          }
        />

        <Field icon='eye-open'>
          {minimongoStore.activeCollectionDocuments.pagination.length}
        </Field>
      </div>

      <div className='right-group'>
        {hasData && !isExporting && (
          <Tooltip content='Export Minimongo data' position='top'>
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
      </div>
    </StatusBar>
  )
})
