import React, { FormEvent, FunctionComponent, useCallback } from 'react'
import { StatusBar } from '@/Components/StatusBar'
import { Button } from '@/Components/Button'
import { TextInput } from '@/Components/TextInput'
import { Field } from '@/Components/Field'
import { observer } from 'mobx-react-lite'
import { usePanelStore } from '@/Stores/PanelStore'
import { Tooltip } from '@blueprintjs/core'
import { exportCollectionToJSON } from '@/Utils/DownloadUtils'
import { AppToaster } from '@/AppToaster'

export const MinimongoStatus: FunctionComponent = observer(() => {
  const { minimongoStore } = usePanelStore()

  const handleExport = useCallback(async () => {
    try {
      const collectionName =
        minimongoStore.activeCollection || 'all_collections'
      const data = minimongoStore.activeCollectionDocuments.collection.map(
        wrapper => wrapper.document,
      )
      await exportCollectionToJSON(collectionName, data)
      AppToaster.show({
        icon: 'tick',
        message: 'Collection exported successfully',
        intent: 'success',
        timeout: 2000,
      })
    } catch (error) {
      console.error('Failed to export collection:', error)
      AppToaster.show({
        icon: 'error',
        message: 'Failed to export collection',
        intent: 'danger',
        timeout: 2000,
      })
    }
  }, [minimongoStore])

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
        {minimongoStore.activeCollectionDocuments.collection.length > 0 && (
          <Tooltip content='Export collection as JSON' position='top'>
            <Button onClick={handleExport} icon='export' />
          </Tooltip>
        )}
      </div>
    </StatusBar>
  )
})
